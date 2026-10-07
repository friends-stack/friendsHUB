const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

module.exports = function setupTelegramBot({ bot, db, io, logAction, UPLOADS_DIR }) {
  if (!bot || !process.env.TG_TOKEN || process.env.TG_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('Telegram bot skipped (invalid or missing token).');
    return;
  }

  // Session state cache: tgUserId -> { action: string, data?: any }
  const userStates = new Map();
  // Temporary cache for raw text posts pending decision: tgUserId -> text
  const pendingPosts = new Map();

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  // Keyboard generators
  const getAdminKeyboard = (isSuperAdmin = false) => {
    const buttons = [
      ['📝 Post', '👥 View Messages'],
      ['💰 Check Savings', '🏷️ Usernames']
    ];
    if (isSuperAdmin) {
      buttons.push(['⚙️ Requests', '🛡️ Manage Admins']);
      buttons.push(['👤 My Identity']);
    } else {
      buttons.push(['👤 My Identity', 'ℹ️ Help']);
    }
    return Markup.keyboard(buttons).resize();
  };

  const getMemberKeyboard = () => {
    return Markup.keyboard([
      ['👥 View Messages', '💰 Check Savings'],
      ['🏷️ Usernames', '👤 My Identity'],
      ['ℹ️ Help']
    ]).resize();
  };

  const getCancelKeyboard = () => {
    return Markup.keyboard([
      ['❌ Cancel']
    ]).resize();
  };

  // Resolve user profile, role, and permissions, keeping username live & synced
  const getTelegramProfile = async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    if (!tgId) return null;

    const isSuperAdminEnv = (process.env.ADMIN_CHAT_ID && tgId === process.env.ADMIN_CHAT_ID.toString());
    const rawUsername = ctx.from?.username ? ctx.from.username.replace(/^@/, '') : '';
    const cleanUsername = rawUsername ? `@${rawUsername}` : '';
    const firstName = ctx.from?.first_name || '';
    const lastName = ctx.from?.last_name || '';

    // 1. Check or seed bot_access record
    let access = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(tgId);
    if (!access && rawUsername) {
      access = await db.prepare('SELECT * FROM bot_access WHERE LOWER(username) = LOWER(?)').get(rawUsername);
      if (access) {
        await db.prepare('UPDATE bot_access SET telegram_id = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          tgId,
          firstName || access.first_name,
          lastName || access.last_name,
          access.id
        );
        access.telegram_id = tgId;
      }
    }
    if (isSuperAdminEnv) {
      if (!access) {
        await db.prepare('INSERT INTO bot_access (telegram_id, first_name, last_name, username, role) VALUES (?, ?, ?, ?, ?)').run(
          tgId,
          firstName || 'Super Admin',
          lastName || '',
          rawUsername || 'SuperAdmin',
          'super_admin'
        );
        access = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(tgId);
      } else if (access.role !== 'super_admin') {
        await db.prepare("UPDATE bot_access SET role = 'super_admin' WHERE telegram_id = ?").run(tgId);
        access.role = 'super_admin';
      }
    }

    // Always keep latest username, first_name, and last_name synchronized in bot_access
    if (access) {
      if (
        (rawUsername && rawUsername !== access.username) ||
        (firstName && firstName !== access.first_name) ||
        (lastName && lastName !== access.last_name)
      ) {
        await db.prepare('UPDATE bot_access SET username = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?').run(
          rawUsername || access.username,
          firstName || access.first_name,
          lastName || access.last_name,
          tgId
        );
        access.username = rawUsername || access.username;
        access.first_name = firstName || access.first_name;
        access.last_name = lastName || access.last_name;
      }
    }

    // 2. Check users table by telegram_id
    let user = await db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);

    // Auto-link Super Admin in users table if needed
    if (!user && isSuperAdminEnv) {
      user = await db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id ASC LIMIT 1').get('super_admin');
      if (user) {
        await db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tgId, user.id);
      }
    }

    // Fallback link by username if recorded on website
    if (!user && rawUsername) {
      user = await db.prepare('SELECT * FROM users WHERE LOWER(telegram_username) = LOWER(?) OR LOWER(telegram_username) = LOWER(?)').get(cleanUsername, rawUsername);
      if (user) {
        await db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tgId, user.id);
      }
    }

    // If user is linked, ensure users.telegram_username matches their latest live username
    if (user && cleanUsername && user.telegram_username !== cleanUsername) {
      await db.prepare('UPDATE users SET telegram_username = ? WHERE id = ?').run(cleanUsername, user.id);
      user.telegram_username = cleanUsername;
    }

    // Auto-promote bot_access if matching user is an admin or enrolled member on the platform
    if (user && access && access.role === 'pending') {
      if (['super_admin', 'admin'].includes(user.role)) {
        await db.prepare("UPDATE bot_access SET role = 'admin' WHERE telegram_id = ?").run(tgId);
        access.role = 'admin';
      } else if (user.created_by_admin === 1 || user.role === 'authorized') {
        await db.prepare("UPDATE bot_access SET role = 'user' WHERE telegram_id = ?").run(tgId);
        access.role = 'user';
      }
    }

    // Link bot_access with user_id
    if (user && access && !access.user_id) {
      await db.prepare('UPDATE bot_access SET user_id = ? WHERE telegram_id = ?').run(user.id, tgId);
      access.user_id = user.id;
    }

    // Determine effective role
    let role = 'none';
    if (isSuperAdminEnv || user?.role === 'super_admin' || access?.role === 'super_admin') {
      role = 'super_admin';
    } else if (access) {
      role = access.role; // 'admin', 'user', 'pending', 'rejected'
    } else if (user) {
      role = user.role;
    }

    return {
      tgId,
      access,
      user,
      role,
      username: cleanUsername,
      rawUsername,
      firstName,
      lastName,
      isSuperAdmin: role === 'super_admin',
      isAdmin: ['super_admin', 'admin'].includes(role),
      canPost: ['super_admin', 'admin'].includes(role),
      canView: ['super_admin', 'admin', 'user'].includes(role),
      isPending: role === 'pending',
      isRejected: role === 'rejected'
    };
  };

  // Helper to publish chat text to database and broadcast to Socket.IO
  const publishChatMessage = async (profile, ctx, text) => {
    const senderUser = profile.user || {
      id: 4,
      email: profile.isSuperAdmin ? 'ermiasgesgis@gmail.com' : 'admin@friends.local',
      nickname: profile.isSuperAdmin ? 'Super Admin' : ([ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Admin')
    };
    const now = new Date().toISOString();

    const result = await db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, reply_to_id, content, media_url, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(senderUser.id, null, null, text, null, 'text', now);

    const broadcastMsg = {
      id: result.lastInsertRowid,
      sender_id: senderUser.id,
      sender_email: senderUser.email,
      sender_nickname: senderUser.nickname,
      receiver_id: null,
      reply_to_id: null,
      content: text,
      media_url: null,
      media_type: 'text',
      created_at: now
    };

    io.to('private').emit('receive_message', broadcastMsg);
    logAction(senderUser.id, 'TG_POST_CHAT', `Posted text message via Telegram: "${text.substring(0, 50)}"`);
    return broadcastMsg;
  };

  // Helper to publish official announcement
  const publishAnnouncementMessage = async (profile, ctx, text) => {
    const senderUser = profile.user || {
      id: 4,
      email: profile.isSuperAdmin ? 'ermiasgesgis@gmail.com' : 'admin@friends.local',
      nickname: profile.isSuperAdmin ? 'Super Admin' : ([ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Admin')
    };
    const now = new Date().toISOString();
    const formattedContent = `📢 [OFFICIAL ANNOUNCEMENT from ${senderUser.nickname || senderUser.email}]\n\n${text}`;

    const result = await db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, reply_to_id, content, media_url, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(senderUser.id, null, null, formattedContent, null, 'text', now);

    const broadcastMsg = {
      id: result.lastInsertRowid,
      sender_id: senderUser.id,
      sender_email: senderUser.email,
      sender_nickname: senderUser.nickname,
      receiver_id: null,
      reply_to_id: null,
      content: formattedContent,
      media_url: null,
      media_type: 'text',
      created_at: now
    };

    io.to('private').emit('receive_message', broadcastMsg);
    logAction(senderUser.id, 'TG_BROADCAST_ANNOUNCE', `Broadcasted announcement via Telegram: "${text.substring(0, 50)}"`);
    return broadcastMsg;
  };

  // Register commands for Telegram UI menu
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start bot & detect username' },
    { command: 'admins', description: 'Super Admin: Manage admins & roles' },
    { command: 'addadmin', description: 'Super Admin: Add admin by username/ID' },
    { command: 'removeadmin', description: 'Super Admin: Remove admin privileges' },
    { command: 'setrole', description: 'Super Admin: Change user role' },
    { command: 'track', description: 'Track your Telegram username live' },
    { command: 'trackusers', description: 'Super Admin: Track all member usernames' },
    { command: 'post', description: 'Post text to website live chat' },
    { command: 'announce', description: 'Broadcast announcement to site' },
    { command: 'messages', description: 'View latest messages from site' },
    { command: 'savings', description: 'Check savings & investments overview' },
    { command: 'whoami', description: 'Check your access permissions' },
    { command: 'requests', description: 'Super Admin: review access requests' },
    { command: 'help', description: 'Show all bot commands and buttons' }
  ]).catch(console.error);

  // START HANDLER: Detects Telegram username on start and sets up access
  bot.start(async (ctx) => {
    const tgId = ctx.from.id.toString();
    const username = ctx.from.username ? `@${ctx.from.username.replace(/^@/, '')}` : null;
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'Friend';
    const profile = await getTelegramProfile(ctx);

    const usernameDetectedText = username
      ? `🏷️ <b>Detected Username:</b> <code>${escapeHtml(username)}</code>\n`
      : `⚠️ <b>Detected Username:</b> <i>No @username set in your Telegram profile</i>\n`;

    const trackInlineButtons = [
      [
        Markup.button.callback('🔍 Track My Username', 'track_my_username'),
        ...(username ? [Markup.button.url('🔗 Open Profile', `https://t.me/${ctx.from.username.replace(/^@/, '')}`)] : [])
      ]
    ];
    if (profile.isAdmin) {
      trackInlineButtons.push([Markup.button.callback('📋 Track All Member Usernames', 'track_all_usernames')]);
    }

    if (profile.isSuperAdmin) {
      return ctx.reply(
        `👑 <b>Welcome, Super Admin ${escapeHtml(name)}!</b>\n\n` +
        usernameDetectedText +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `🛡️ <b>Role:</b> SUPER ADMIN\n` +
        `✅ You have full platform authority. You can post directly to the website live chat, broadcast announcements, track user identities, and approve/reject new user access requests.\n\n` +
        `👇 <b>Use the persistent buttons below to take action:</b>`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(true),
          ...Markup.inlineKeyboard(trackInlineButtons)
        }
      );
    }

    if (profile.isAdmin) {
      return ctx.reply(
        `🛡️ <b>Welcome, Admin ${escapeHtml(name)}!</b>\n\n` +
        usernameDetectedText +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `🛡️ <b>Role:</b> ADMIN\n` +
        `✅ Permissions: Full Posting Privileges Granted (Chat, Announcements, Gallery).\n\n` +
        `👇 <b>Use the persistent buttons below to post or view messages:</b>`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(false),
          ...Markup.inlineKeyboard(trackInlineButtons)
        }
      );
    }

    if (profile.canView && profile.role === 'user') {
      return ctx.reply(
        `👋 <b>Welcome back, ${escapeHtml(name)}!</b>\n\n` +
        usernameDetectedText +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `👤 <b>Role:</b> APPROVED MEMBER (View-Only)\n` +
        `✅ Permissions: You can view messages, savings data, and track your identity.\n\n` +
        `ℹ️ Note: Only Admins and Super Admin can post messages to the website live chat.`,
        {
          parse_mode: 'HTML',
          ...getMemberKeyboard(),
          ...Markup.inlineKeyboard(trackInlineButtons)
        }
      );
    }

    if (profile.isPending) {
      return ctx.reply(
        `⏳ <b>ACCESS REQUEST PENDING</b>\n\n` +
        `Hello ${escapeHtml(name)},\n` +
        usernameDetectedText +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n\n` +
        `Your request is currently waiting for review by the Super Admin.\n\n` +
        `🔒 <b>You cannot view messages or post content until your request is approved.</b>\n\n` +
        `You will receive an instant notification right here once the Super Admin grants you access.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Track My Username', 'track_my_username')]
          ])
        }
      );
    }

    if (profile.isRejected) {
      return ctx.reply(
        `⛔ <b>Access Restricted</b>\n\n` +
        usernameDetectedText +
        `Your request to access the bot was declined by the Super Admin.\n` +
        `If you believe this is an error, please contact the administrator.`
      );
    }

    // Brand new Telegram user starting the bot:
    await db.prepare(`
      INSERT INTO bot_access (telegram_id, first_name, last_name, username, role)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(
      tgId,
      ctx.from.first_name || '',
      ctx.from.last_name || '',
      ctx.from.username || ''
    );

    await ctx.reply(
      `👋 <b>Welcome to the F.R.I.E.N.D.S Platform Bot!</b>\n\n` +
      usernameDetectedText +
      `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n\n` +
      `🔒 <i>This platform and bot are strictly private and role-based.</i>\n\n` +
      `📨 <b>Your access request has been sent to the Super Admin.</b>\n\n` +
      `🚫 You cannot see any messages or use bot features until the Super Admin gives you permission.\n\n` +
      `Please wait for confirmation.`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Track My Username', 'track_my_username')]
        ])
      }
    );

    // Dispatch an approval request to the Super Admin with inline action buttons
    if (process.env.ADMIN_CHAT_ID) {
      const usernameDisplay = username ? username : 'No username set';
      const adminNotice =
        `🔔 <b>NEW BOT ACCESS REQUEST</b>\n\n` +
        `👤 <b>Name:</b> ${escapeHtml(name)}\n` +
        `🏷️ <b>Detected Username:</b> ${escapeHtml(usernameDisplay)}\n` +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `🕒 <b>Time:</b> ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true })}\n\n` +
        `This user has started the bot and their username was detected automatically.\n` +
        `Select an action:`;

      const approvalButtons = [
        [
          Markup.button.callback('🛡️ Approve Admin (Can Post)', `grant_admin_${tgId}`),
          Markup.button.callback('👤 Approve Member (View Only)', `grant_member_${tgId}`)
        ],
        [
          Markup.button.callback('❌ Reject Access', `grant_reject_${tgId}`)
        ]
      ];
      if (ctx.from.username) {
        approvalButtons.push([
          Markup.button.url(`🔍 Track @${ctx.from.username.replace(/^@/, '')}`, `https://t.me/${ctx.from.username.replace(/^@/, '')}`)
        ]);
      }

      try {
        await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminNotice, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(approvalButtons)
        });
        logAction(null, 'TG_ACCESS_REQUEST_SENT', `Access request for ${name} (${usernameDisplay}) sent to Super Admin`);
      } catch (err) {
        console.error('Failed to dispatch access request to Super Admin:', err.message);
      }
    }
  });

  // SUPER ADMIN INLINE APPROVAL HANDLERS
  bot.action(/^grant_(admin|member|reject)_(\d+)$/, async (ctx) => {
    const adminProfile = await getTelegramProfile(ctx);
    if (!adminProfile.isSuperAdmin) {
      return ctx.answerCbQuery('⛔ Only Super Admin can approve or reject access requests.', { show_alert: true });
    }

    const decision = ctx.match[1]; // 'admin', 'member', or 'reject'
    const targetTgId = ctx.match[2];

    const targetAccess = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(targetTgId);
    const targetName = targetAccess
      ? ([targetAccess.first_name, targetAccess.last_name].filter(Boolean).join(' ') || targetAccess.username || targetTgId)
      : targetTgId;

    if (decision === 'admin') {
      await db.prepare("UPDATE bot_access SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?").run(targetTgId);
      logAction(adminProfile.user?.id || null, 'TG_APPROVE_ADMIN', `Super Admin approved ${targetName} (${targetTgId}) as Admin`);

      await ctx.editMessageText(
        `✅ <b>REQUEST APPROVED AS ADMIN</b>\n\n` +
        `👤 User: <b>${escapeHtml(targetName)}</b>\n` +
        `🆔 Telegram ID: <code>${targetTgId}</code>\n` +
        `🛡️ Role Granted: <b>ADMIN (Full Posting & Viewing Privileges)</b>\n` +
        `📅 Decision Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`,
        { parse_mode: 'HTML' }
      );
      await ctx.answerCbQuery('Approved as Admin!');

      // Notify user on Telegram
      try {
        await bot.telegram.sendMessage(
          targetTgId,
          `🎉 <b>ACCESS GRANTED BY SUPER ADMIN!</b>\n\n` +
          `🛡️ You have been granted <b>ADMIN</b> access to the F.R.I.E.N.D.S bot!\n\n` +
          `You can now view messages and post directly to the website live chat, announcements, and gallery.\n\n` +
          `👇 <b>Use the buttons below to begin:</b>`,
          {
            parse_mode: 'HTML',
            ...getAdminKeyboard(false)
          }
        );
      } catch (e) {
        console.warn(`Could not send approval message to ${targetTgId}:`, e.message);
      }
    } else if (decision === 'member') {
      await db.prepare("UPDATE bot_access SET role = 'user', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?").run(targetTgId);
      logAction(adminProfile.user?.id || null, 'TG_APPROVE_MEMBER', `Super Admin approved ${targetName} (${targetTgId}) as Member`);

      await ctx.editMessageText(
        `✅ <b>REQUEST APPROVED AS MEMBER</b>\n\n` +
        `👤 User: <b>${escapeHtml(targetName)}</b>\n` +
        `🆔 Telegram ID: <code>${targetTgId}</code>\n` +
        `👤 Role Granted: <b>MEMBER (View-Only Privileges)</b>\n` +
        `📅 Decision Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`,
        { parse_mode: 'HTML' }
      );
      await ctx.answerCbQuery('Approved as Member!');

      // Notify user on Telegram
      try {
        await bot.telegram.sendMessage(
          targetTgId,
          `🎉 <b>ACCESS GRANTED BY SUPER ADMIN!</b>\n\n` +
          `👤 You have been granted <b>MEMBER</b> access to the F.R.I.E.N.D.S bot!\n\n` +
          `You can now view messages, savings data, and community updates.\n` +
          `<i>(Note: Only Admins can publish posts to the live chat).</i>\n\n` +
          `👇 <b>Use the buttons below to explore:</b>`,
          {
            parse_mode: 'HTML',
            ...getMemberKeyboard()
          }
        );
      } catch (e) {
        console.warn(`Could not send approval message to ${targetTgId}:`, e.message);
      }
    } else if (decision === 'reject') {
      await db.prepare("UPDATE bot_access SET role = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?").run(targetTgId);
      logAction(adminProfile.user?.id || null, 'TG_REJECT_ACCESS', `Super Admin rejected ${targetName} (${targetTgId})`);

      await ctx.editMessageText(
        `❌ <b>REQUEST REJECTED</b>\n\n` +
        `👤 User: <b>${escapeHtml(targetName)}</b>\n` +
        `🆔 Telegram ID: <code>${targetTgId}</code>\n` +
        `Status: <b>ACCESS DECLINED</b>\n` +
        `📅 Decision Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`,
        { parse_mode: 'HTML' }
      );
      await ctx.answerCbQuery('Request Rejected');

      // Notify user
      try {
        await bot.telegram.sendMessage(
          targetTgId,
          `⛔ <b>Access Request Update</b>\n\n` +
          `Your request to access the F.R.I.E.N.D.S bot was reviewed and declined by the Super Admin.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.warn(`Could not send rejection message to ${targetTgId}:`, e.message);
      }
    }
  });

  // MAIN MENU: 📝 POST (Chat, Gallery, Announcement inside)
  const handlePostMenu = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin are permitted to publish posts.');
    }

    const text =
      `📝 <b>POST & PUBLISH MENU</b>\n\n` +
      `Choose where you would like to publish content to the platform:`;

    const buttons = [
      [
        Markup.button.callback('💬 Post to Live Chat', 'menu_post_chat'),
        Markup.button.callback('🖼️ Post to Gallery', 'menu_post_gallery')
      ],
      [
        Markup.button.callback('📢 Broadcast Announcement', 'menu_post_announce')
      ],
      [
        Markup.button.callback('❌ Cancel', 'menu_post_cancel')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  bot.hears(['📝 Post', 'Post', '/postmenu'], handlePostMenu);

  // Sub-actions for Post Menu
  bot.action('menu_post_chat', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.answerCbQuery('⛔ Access Denied', { show_alert: true });
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_chat_post' });
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    ctx.reply(
      '💬 <b>Post to Live Chat</b>\n\n' +
      'Please send the message you want to post to the website live chat.\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
  });

  bot.action('menu_post_gallery', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.answerCbQuery('⛔ Access Denied', { show_alert: true });
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_gallery_photo' });
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    ctx.reply(
      '🖼️ <b>Post to Website Gallery</b>\n\n' +
      'Please send a photo with a caption or title. It will be published directly to the Community Gallery!\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
  });

  bot.action('menu_post_announce', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.answerCbQuery('⛔ Access Denied', { show_alert: true });
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_announcement' });
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    ctx.reply(
      '📢 <b>Broadcast Announcement</b>\n\n' +
      'Please send the announcement text to display across the website.\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
  });

  bot.action('menu_post_cancel', async (ctx) => {
    userStates.delete(ctx.from.id.toString());
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Cancelled');
      await ctx.editMessageText('❌ Post cancelled.');
    }
  });

  // Direct backwards-compatibility buttons
  bot.hears('💬 Post to Chat', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.reply('⛔ Only Admins can post to live chat.');
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_chat_post' });
    ctx.reply('💬 <b>Post to Live Chat</b>\n\nPlease send your message:', { parse_mode: 'HTML', ...getCancelKeyboard() });
  });

  bot.hears('📢 Announcement', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.reply('⛔ Only Admins can broadcast announcements.');
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_announcement' });
    ctx.reply('📢 <b>Broadcast Announcement</b>\n\nPlease send announcement text:', { parse_mode: 'HTML', ...getCancelKeyboard() });
  });

  bot.hears('🖼️ Post to Gallery', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) return ctx.reply('⛔ Only Admins can post photos.');
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_gallery_photo' });
    ctx.reply('🖼️ <b>Post to Gallery</b>\n\nPlease send a photo with caption:', { parse_mode: 'HTML', ...getCancelKeyboard() });
  });

  // CANCEL BUTTON: '❌ Cancel'
  bot.hears(['❌ Cancel', 'Cancel', '/cancel'], async (ctx) => {
    const tgId = ctx.from.id.toString();
    userStates.delete(tgId);
    pendingPosts.delete(tgId);
    const profile = await getTelegramProfile(ctx);
    const keyboard = profile.isAdmin ? getAdminKeyboard(profile.isSuperAdmin) : getMemberKeyboard();
    ctx.reply('❌ Action cancelled.', keyboard);
  });

  // ==========================================
  // MAIN MENU: 👥 VIEW MESSAGES (WITH MSG, TIME, DATE & TELEGRAM USERNAMES)
  // ==========================================
  bot.hears(['👥 View Messages', '/messages', '5'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to view messages.');
    }

    const lastMessages = (await db.prepare(`
      SELECT m.content, m.media_url, m.media_type, m.created_at,
             u.nickname, u.full_name, u.email, u.telegram_username,
             b.username as bot_username
      FROM messages m 
      LEFT JOIN users u ON m.sender_id = u.id 
      LEFT JOIN bot_access b ON (u.telegram_id = b.telegram_id OR (u.id IS NOT NULL AND b.user_id = u.id))
      ORDER BY m.created_at DESC LIMIT 10
    `).all()).reverse();

    if (lastMessages.length === 0) {
      return ctx.reply('💬 No messages found in the live chat.');
    }

    const historyText = lastMessages.map(m => {
      const dateObj = new Date(m.created_at);
      const msgDate = dateObj.toLocaleDateString('en-US', { timeZone: 'Africa/Addis_Ababa', month: 'short', day: 'numeric', year: 'numeric' });
      const msgTime = dateObj.toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });

      const senderName = m.nickname || m.full_name || m.email || 'Member';
      const rawTg = m.telegram_username ? m.telegram_username.replace(/^@/, '') : (m.bot_username ? m.bot_username.replace(/^@/, '') : '');
      const tgDisplay = rawTg ? `@${escapeHtml(rawTg)}` : '<i>No @username</i>';
      const tgLink = rawTg ? ` <a href="https://t.me/${escapeHtml(rawTg)}">[Profile]</a>` : '';
      const mediaIndicator = m.media_url ? '📷 <i>[Media Attached]</i>\n' : '';

      return (
        `💬 <b>${escapeHtml(senderName)}</b> (🏷️ ${tgDisplay}${tgLink})\n` +
        `📅 <b>Date:</b> ${msgDate} | ⏰ <b>Time:</b> ${msgTime}\n` +
        `📝 <b>Message:</b> ${mediaIndicator}${escapeHtml(m.content || '(Media only)')}`
      );
    }).join('\n\n──────────────\n\n');

    const extra = profile.isAdmin ? Markup.inlineKeyboard([[Markup.button.callback('📜 Show 50 Messages', 'show_messages')]]) : undefined;

    ctx.reply(`💬 <b>LIVE CHAT RECENT MESSAGES</b>\n\n${historyText}`, { parse_mode: 'HTML', ...extra });
  });

  // ==========================================
  // MAIN MENU: 💰 CHECK SAVINGS (SYNCED WITH MEMBERS DASHBOARD)
  // ==========================================
  bot.hears(['💰 Check Savings', '💰 Savings', '/savings'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to view savings data.');
    }

    try {
      // 1. Auto-sync active admins to savings_members (exact same logic as GET /api/savings/members)
      try {
        const admins = await db.prepare("SELECT nickname, full_name, email FROM users WHERE role IN ('super_admin', 'admin') AND (status != 'deleted' OR status IS NULL)").all();
        for (const admin of admins) {
          const adminName = admin.full_name || admin.nickname || admin.email;
          if (!adminName) continue;
          const existing = await db.prepare("SELECT id FROM savings_members WHERE LOWER(name) = LOWER(?)").get(adminName);
          if (!existing) {
            await db.prepare("INSERT INTO savings_members (name) VALUES (?)").run(adminName);
          }
        }
      } catch (syncErr) {}

      // 2. Fetch members and match with active users
      const allSavingsMembers = await db.prepare('SELECT * FROM savings_members ORDER BY name ASC').all();
      const allUsers = await db.prepare('SELECT nickname, full_name, email, role FROM users').all();
      const activeMembers = [];

      for (const m of allSavingsMembers) {
        const matchedUser = allUsers.find(u => 
          (u.full_name && m.name.toLowerCase().replace(/\s+/g, '') === u.full_name.toLowerCase().replace(/\s+/g, '')) ||
          (u.nickname && m.name.toLowerCase().replace(/\s+/g, '') === u.nickname.toLowerCase().replace(/\s+/g, '')) ||
          (u.full_name && m.name.toLowerCase().includes(u.full_name.toLowerCase())) ||
          (u.nickname && m.name.toLowerCase().includes(u.nickname.toLowerCase())) ||
          (u.email && u.email.toLowerCase().startsWith(m.name.split(' ')[0].toLowerCase()))
        );
        if (matchedUser && ['admin', 'super_admin'].includes(matchedUser.role)) {
          m.role = matchedUser.role;
          activeMembers.push(m);
        }
      }

      let totalSaving = 0;
      for (const m of activeMembers) {
        const trans = await db.prepare('SELECT amount, type FROM savings_transactions WHERE member_id = ?').all(m.id);
        const paid = trans.filter(t => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);
        totalSaving += paid;
      }

      const investments = await db.prepare('SELECT * FROM savings_investments').all();
      const config = await db.prepare('SELECT * FROM savings_config ORDER BY id DESC LIMIT 1').get() || { weekly_amount: 300 };

      const moneyAtWork = investments
        .filter(i => i.status === 'active')
        .reduce((s, i) => s + Number(i.allocated_amount || 0), 0);

      const completedProfits = investments
        .filter(i => i.status === 'completed')
        .reduce((s, i) => {
          const net = (i.profit !== undefined && i.profit !== null && Number(i.profit) !== 0)
            ? Number(i.profit)
            : (Number(i.projected_profit) || 0);
          return s + net;
        }, 0);

      const remainingMoney = Math.max(0, (totalSaving + completedProfits) - moneyAtWork);

      const savingsMessage =
        `💰 <b>SAVINGS & WORKING CAPITAL OVERVIEW</b>\n\n` +
        `🟡 <b>Remaining Money:</b> ETB ${remainingMoney.toLocaleString()} (Cash & Bank)\n` +
        `🔵 <b>Money at Work:</b> ETB ${moneyAtWork.toLocaleString()} (Active Investments)\n` +
        `🟢 <b>Total Saving:</b> ETB ${totalSaving.toLocaleString()} (Cumulative Pool)\n` +
        `📈 <b>Realized Profit:</b> ETB ${completedProfits.toLocaleString()}\n` +
        `👥 <b>Active Members:</b> ${activeMembers.length}\n` +
        `📅 <b>Weekly Rate:</b> ETB ${config.weekly_amount}/wk\n\n` +
        `<i>Verified live against database.</i>`;

      await ctx.reply(savingsMessage, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Error computing savings overview:', err);
      ctx.reply('⚠️ Error computing savings overview: ' + err.message);
    }
  });

  // BUTTON 6: '👤 My Identity'
  bot.hears(['👤 My Identity', '/whoami'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    const tgId = ctx.from.id.toString();
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'User';

    ctx.reply(
      `👤 <b>YOUR PLATFORM IDENTITY</b>\n\n` +
      `• <b>Name:</b> ${escapeHtml(name)}\n` +
      `• <b>Telegram ID:</b> <code>${tgId}</code>\n` +
      `• <b>Role:</b> ${profile.role.toUpperCase()}\n` +
      `• <b>View Messages:</b> ${profile.canView ? '✅ ALLOWED' : '⛔ RESTRICTED'}\n` +
      `• <b>Post to Website:</b> ${profile.canPost ? '✅ GRANTED' : '⛔ RESTRICTED'}\n` +
      `• <b>Linked Web Account:</b> ${profile.user ? escapeHtml(profile.user.email) : 'None (linked via Telegram)'}`
    , { parse_mode: 'HTML' });
  });

  // Helper to respond to both text messages and callback queries
  const respondWithCard = async (ctx, htmlText, extraMarkup) => {
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(htmlText, { parse_mode: 'HTML', ...extraMarkup });
      } catch (err) {
        await ctx.reply(htmlText, { parse_mode: 'HTML', ...extraMarkup });
      }
      try {
        await ctx.answerCbQuery('Username verified');
      } catch (e) {}
    } else {
      await ctx.reply(htmlText, { parse_mode: 'HTML', ...extraMarkup });
    }
  };

  // ==========================================
  // DIRECTORY & USERNAMES ENGINE
  // ==========================================

  // Universal helper to retrieve all platform users and map their Telegram identity, ID, and Email
  const getDirectoryUsers = async () => {
    // 1. Fetch from bot_access
    const botUsers = await db.prepare(`
      SELECT b.telegram_id, b.username, b.first_name, b.last_name, b.role as bot_role, b.user_id,
             u.id as web_id, u.email, u.nickname, u.full_name, u.role as web_role, u.telegram_username, u.status
      FROM bot_access b
      LEFT JOIN users u ON (b.user_id = u.id OR (b.username != '' AND LOWER(REPLACE(u.telegram_username, '@', '')) = LOWER(b.username)))
      WHERE (u.status != 'deleted' OR u.status IS NULL)
    `).all();

    // 2. Fetch from users table to catch any website users not yet in bot_access
    const webUsers = await db.prepare(`
      SELECT id as web_id, email, nickname, full_name, role as web_role, telegram_id, telegram_username, status
      FROM users
      WHERE (status != 'deleted' OR status IS NULL)
    `).all();

    const directory = new Map();

    for (const b of botUsers) {
      const key = b.telegram_id || (b.web_id ? `web_${b.web_id}` : (b.username || Math.random().toString()));
      const rawName = [b.first_name, b.last_name].filter(Boolean).join(' ') || b.nickname || b.full_name || b.username || 'User';
      const rawTg = b.username ? b.username.replace(/^@/, '') : (b.telegram_username ? b.telegram_username.replace(/^@/, '') : '');
      const tgUsername = rawTg ? `@${rawTg}` : 'None';
      
      let effectiveRole = 'member';
      if (b.bot_role === 'super_admin' || b.web_role === 'super_admin' || (process.env.ADMIN_CHAT_ID && b.telegram_id === process.env.ADMIN_CHAT_ID.toString())) {
        effectiveRole = 'super_admin';
      } else if (b.bot_role === 'admin' || b.web_role === 'admin') {
        effectiveRole = 'admin';
      } else if (b.bot_role === 'pending') {
        effectiveRole = 'pending';
      } else if (b.bot_role === 'rejected') {
        effectiveRole = 'rejected';
      }

      directory.set(key, {
        telegram_name: rawName,
        username: tgUsername,
        raw_username: rawTg,
        telegram_id: b.telegram_id || 'Not linked',
        email: b.email || 'None',
        role: effectiveRole
      });
    }

    for (const u of webUsers) {
      if (u.telegram_id && directory.has(u.telegram_id)) {
        const item = directory.get(u.telegram_id);
        if (u.email && item.email === 'None') item.email = u.email;
        if ((u.full_name || u.nickname) && (!item.telegram_name || item.telegram_name === 'User')) {
          item.telegram_name = u.full_name || u.nickname;
        }
        continue;
      }

      const rawTg = u.telegram_username ? u.telegram_username.replace(/^@/, '') : '';
      const matchingKey = Array.from(directory.keys()).find(k => {
        const item = directory.get(k);
        return item.raw_username && rawTg && item.raw_username.toLowerCase() === rawTg.toLowerCase();
      });

      if (matchingKey) {
        const item = directory.get(matchingKey);
        if (u.email && item.email === 'None') item.email = u.email;
        continue;
      }

      const effectiveRole = (u.web_role === 'super_admin') ? 'super_admin'
        : (u.web_role === 'admin') ? 'admin'
        : 'member';

      directory.set(`web_${u.web_id}`, {
        telegram_name: u.full_name || u.nickname || 'Member',
        username: rawTg ? `@${rawTg}` : 'None',
        raw_username: rawTg,
        telegram_id: u.telegram_id || 'Not linked',
        email: u.email || 'None',
        role: effectiveRole
      });
    }

    return Array.from(directory.values());
  };

  // MAIN MENU: 🏷️ USERNAMES (Unified Hub)
  const handleUsernamesMenu = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('🔒 Access Denied', { show_alert: true });
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin.');
    }

    const all = await getDirectoryUsers();
    const adminsCount = all.filter(u => ['super_admin', 'admin'].includes(u.role)).length;
    const membersCount = all.filter(u => !['super_admin', 'admin', 'pending', 'rejected'].includes(u.role)).length;

    const text =
      `🏷️ <b>USERNAMES & PLATFORM DIRECTORY</b>\n\n` +
      `Browse community members and administrators registered on the platform:\n\n` +
      `👥 <b>Members (${membersCount}):</b> Saving & active community members\n` +
      `🛡️ <b>Admins (${adminsCount}):</b> Platform administrators & super admin\n` +
      `📋 <b>All Users (${all.length}):</b> Full combined directory\n` +
      `👤 <b>My Identity:</b> Your detected username and permissions\n\n` +
      `<i>Select an option below to view details:</i>`;

    const buttons = [
      [
        Markup.button.callback(`👥 Members List (${membersCount})`, 'unames_members'),
        Markup.button.callback(`🛡️ Admins List (${adminsCount})`, 'unames_admins')
      ],
      [
        Markup.button.callback(`📋 View All (${all.length})`, 'unames_all'),
        Markup.button.callback('🔍 My Username', 'unames_my_profile')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: List Members
  const handleListMembersDirectory = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('🔒 Access Denied', { show_alert: true });
      return ctx.reply('🔒 Access Denied.');
    }

    const all = await getDirectoryUsers();
    const members = all.filter(u => !['super_admin', 'admin', 'pending', 'rejected'].includes(u.role));

    let text = `👥 <b>MEMBERS DIRECTORY (${members.length})</b>\n\n`;

    if (members.length === 0) {
      text += `<i>No regular members registered yet.</i>`;
    } else {
      members.forEach((m, idx) => {
        const tgLink = (m.raw_username && m.username !== 'None') ? ` <a href="https://t.me/${escapeHtml(m.raw_username)}">[Profile]</a>` : '';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(m.telegram_name)}\n` +
          `   <b>Username:</b> ${escapeHtml(m.username)}${tgLink}\n` +
          `   <b>ID:</b> <code>${escapeHtml(m.telegram_id)}</code>\n` +
          `   <b>Email:</b> <code>${escapeHtml(m.email)}</code>\n\n`;
      });
    }

    const buttons = [
      [
        Markup.button.callback('🛡️ View Admins', 'unames_admins'),
        Markup.button.callback('📋 View All', 'unames_all')
      ],
      [
        Markup.button.callback('⬅️ Back to Usernames Menu', 'unames_menu')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: List Admins
  const handleListAdminsDirectory = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('🔒 Access Denied', { show_alert: true });
      return ctx.reply('🔒 Access Denied.');
    }

    const all = await getDirectoryUsers();
    const admins = all.filter(u => ['super_admin', 'admin'].includes(u.role));

    let text = `🛡️ <b>ADMINISTRATORS DIRECTORY (${admins.length})</b>\n\n`;

    if (admins.length === 0) {
      text += `<i>No administrators registered.</i>`;
    } else {
      admins.forEach((a, idx) => {
        const roleBadge = a.role === 'super_admin' ? '👑 SUPER ADMIN' : '🛡️ ADMIN';
        const tgLink = (a.raw_username && a.username !== 'None') ? ` <a href="https://t.me/${escapeHtml(a.raw_username)}">[Profile]</a>` : '';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(a.telegram_name)} (<i>${roleBadge}</i>)\n` +
          `   <b>Username:</b> ${escapeHtml(a.username)}${tgLink}\n` +
          `   <b>ID:</b> <code>${escapeHtml(a.telegram_id)}</code>\n` +
          `   <b>Email:</b> <code>${escapeHtml(a.email)}</code>\n\n`;
      });
    }

    const buttons = [
      [
        Markup.button.callback('👥 View Members', 'unames_members'),
        Markup.button.callback('📋 View All', 'unames_all')
      ],
      [
        Markup.button.callback('⬅️ Back to Usernames Menu', 'unames_menu')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: List All Users (Grouped)
  const handleListAllUsersDirectory = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('🔒 Access Denied', { show_alert: true });
      return ctx.reply('🔒 Access Denied.');
    }

    const all = await getDirectoryUsers();
    const admins = all.filter(u => ['super_admin', 'admin'].includes(u.role));
    const members = all.filter(u => !['super_admin', 'admin', 'pending', 'rejected'].includes(u.role));

    let text = `📋 <b>ALL PLATFORM USERS (${all.length})</b>\n\n`;

    if (admins.length > 0) {
      text += `🛡️ <b>ADMINS:</b>\n`;
      admins.forEach((a, idx) => {
        const roleBadge = a.role === 'super_admin' ? '👑 SUPER ADMIN' : '🛡️ ADMIN';
        const tgLink = (a.raw_username && a.username !== 'None') ? ` <a href="https://t.me/${escapeHtml(a.raw_username)}">[Profile]</a>` : '';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(a.telegram_name)} (<i>${roleBadge}</i>)\n` +
          `   <b>Username:</b> ${escapeHtml(a.username)}${tgLink}\n` +
          `   <b>ID:</b> <code>${escapeHtml(a.telegram_id)}</code>\n` +
          `   <b>Email:</b> <code>${escapeHtml(a.email)}</code>\n\n`;
      });
    }

    if (members.length > 0) {
      text += `👥 <b>MEMBERS:</b>\n`;
      members.forEach((m, idx) => {
        const tgLink = (m.raw_username && m.username !== 'None') ? ` <a href="https://t.me/${escapeHtml(m.raw_username)}">[Profile]</a>` : '';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(m.telegram_name)}\n` +
          `   <b>Username:</b> ${escapeHtml(m.username)}${tgLink}\n` +
          `   <b>ID:</b> <code>${escapeHtml(m.telegram_id)}</code>\n` +
          `   <b>Email:</b> <code>${escapeHtml(m.email)}</code>\n\n`;
      });
    }

    const buttons = [
      [
        Markup.button.callback('👥 Members Only', 'unames_members'),
        Markup.button.callback('🛡️ Admins Only', 'unames_admins')
      ],
      [
        Markup.button.callback('⬅️ Back to Usernames Menu', 'unames_menu')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: My Username details
  const handleMyUsernameProfile = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    const tgId = ctx.from.id.toString();
    const rawUsername = ctx.from.username ? ctx.from.username.replace(/^@/, '') : '';
    const cleanUsername = rawUsername ? `@${rawUsername}` : '';
    const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || rawUsername || 'User';

    const actionButtons = [];
    if (rawUsername) {
      actionButtons.push([
        Markup.button.url('🔗 Open Profile (t.me)', `https://t.me/${rawUsername}`),
        Markup.button.callback('🔄 Re-scan Username', 'unames_my_profile')
      ]);
    } else {
      actionButtons.push([
        Markup.button.callback('🔄 Re-scan Username', 'unames_my_profile')
      ]);
    }
    actionButtons.push([
      Markup.button.callback('⬅️ Back to Usernames Menu', 'unames_menu')
    ]);

    let messageText = '';
    if (rawUsername) {
      messageText =
        `🏷️ <b>MY TELEGRAM USERNAME</b>\n\n` +
        `👤 <b>Telegram Name:</b> ${escapeHtml(fullName)}\n` +
        `🏷️ <b>Username:</b> <code>${escapeHtml(cleanUsername)}</code>\n` +
        `🆔 <b>ID:</b> <code>${tgId}</code>\n` +
        `📧 <b>Email:</b> <code>${escapeHtml(profile.user ? profile.user.email : 'Not linked to web account')}</code>\n` +
        `🛡️ <b>Role:</b> ${profile.role.toUpperCase()}\n` +
        `🔒 <b>Posting Rights:</b> ${profile.canPost ? '✅ GRANTED' : '⛔ VIEW-ONLY'}\n\n` +
        `📡 <i>Live synchronized with database.</i>`;
    } else {
      messageText =
        `⚠️ <b>NO USERNAME DETECTED</b>\n\n` +
        `👤 <b>Name:</b> ${escapeHtml(fullName)}\n` +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `🏷️ <b>Telegram @Username:</b> <i>Not Set</i>\n\n` +
        `Your Telegram account does not currently have a public username configured in Telegram settings.\n\n` +
        `📝 <b>To set your username:</b>\n` +
        `1. Open Telegram Settings\n` +
        `2. Tap <b>Edit Profile</b> (or <b>Username</b>)\n` +
        `3. Choose your desired @username\n` +
        `4. Tap <b>Re-scan Username</b> below once updated!`;
    }

    await respondWithCard(ctx, messageText, Markup.inlineKeyboard(actionButtons));
  };

  // Register Usernames Menu listeners & actions
  bot.hears(['🏷️ Usernames', 'Usernames', '/usernames', 'Username', '🏷️ Track Username', '📋 Track All Usernames', '/track', '/username'], handleUsernamesMenu);
  bot.action('unames_menu', handleUsernamesMenu);
  bot.action('unames_members', handleListMembersDirectory);
  bot.action('unames_admins', handleListAdminsDirectory);
  bot.action('unames_all', handleListAllUsersDirectory);
  bot.action('unames_my_profile', handleMyUsernameProfile);
  bot.action('track_my_username', handleMyUsernameProfile);
  bot.action('track_all_usernames', handleListAllUsersDirectory);

  // ==========================================
  // REQUESTS & ACCESS HUB ENGINE
  // ==========================================

  // MAIN MENU: ⚙️ REQUESTS (Unified Hub for Pending & Accessed Users)
  const handleRequestsMenu = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery('⛔ Only Super Admin can access requests management.', { show_alert: true });
      }
      return ctx.reply('⛔ Access Denied: Only the Super Admin can review access requests.');
    }

    const pendingCount = (await db.prepare("SELECT COUNT(*) as count FROM bot_access WHERE role = 'pending'").get())?.count || 0;
    const accessedCount = (await db.prepare("SELECT COUNT(*) as count FROM bot_access WHERE role IN ('admin', 'user', 'super_admin')").get())?.count || 0;
    const rejectedCount = (await db.prepare("SELECT COUNT(*) as count FROM bot_access WHERE role = 'rejected'").get())?.count || 0;

    const text =
      `⚙️ <b>REQUESTS & ACCESS MANAGEMENT</b>\n\n` +
      `Review user authorizations, pending applicants, and permission states:\n\n` +
      `⏳ <b>Pending Requests (${pendingCount}):</b> Applicants awaiting approval\n` +
      `✅ <b>Accessed / Approved (${accessedCount}):</b> Active users with bot access\n` +
      `🚫 <b>Rejected / Revoked (${rejectedCount}):</b> Users whose access was denied\n\n` +
      `<i>Select an option below to manage:</i>`;

    const buttons = [
      [
        Markup.button.callback(`⏳ Pending Requests (${pendingCount})`, 'req_menu_pending'),
        Markup.button.callback(`✅ Accessed / Approved (${accessedCount})`, 'req_menu_accessed')
      ],
      [
        Markup.button.callback(`🚫 Rejected (${rejectedCount})`, 'req_menu_rejected'),
        Markup.button.callback('🔄 Refresh', 'req_menu_refresh')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: Pending Requests
  const handleRequestsPending = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
      return ctx.reply('⛔ Super Admin only.');
    }

    const pending = await db.prepare("SELECT * FROM bot_access WHERE role = 'pending' ORDER BY created_at DESC").all();

    if (pending.length === 0) {
      const text =
        `✅ <b>PENDING ACCESS REQUESTS</b>\n\n` +
        `There are currently <b>NO</b> pending access requests awaiting review.`;

      const buttons = [
        [Markup.button.callback('✅ View Accessed Users', 'req_menu_accessed')],
        [Markup.button.callback('⬅️ Back to Requests Menu', 'req_menu_home')]
      ];

      return respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
    }

    if (ctx.callbackQuery) await ctx.answerCbQuery();

    await ctx.reply(`📋 <b>Pending Access Requests (${pending.length})</b>:\nReview each applicant below:`, { parse_mode: 'HTML' });

    for (const item of pending) {
      const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.username || 'User';
      const username = item.username ? `@${item.username}` : 'No username';

      await ctx.reply(
        `👤 <b>${escapeHtml(name)}</b>\n` +
        `🏷️ ${escapeHtml(username)}\n` +
        `🆔 <code>${item.telegram_id}</code>\n` +
        `📅 Requested: ${new Date(item.created_at).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🛡️ Approve Admin', `grant_admin_${item.telegram_id}`),
              Markup.button.callback('👤 Approve Member', `grant_member_${item.telegram_id}`)
            ],
            [
              Markup.button.callback('❌ Reject', `grant_reject_${item.telegram_id}`)
            ]
          ])
        }
      );
    }

    await ctx.reply('⚙️ Navigation:', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Requests Menu', 'req_menu_home')]]));
  };

  // Sub-Action: Accessed / Approved Users
  const handleRequestsAccessed = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
      return ctx.reply('⛔ Super Admin only.');
    }

    const all = await getDirectoryUsers();
    const accessed = all.filter(u => ['super_admin', 'admin', 'member'].includes(u.role));

    let text = `✅ <b>ACCESSED / APPROVED USERS (${accessed.length})</b>\n\n`;

    if (accessed.length === 0) {
      text += `<i>No users currently authorized.</i>`;
    } else {
      accessed.forEach((u, idx) => {
        const roleBadge = u.role === 'super_admin' ? '👑 SUPER ADMIN' : (u.role === 'admin' ? '🛡️ ADMIN' : '👤 MEMBER');
        const tgLink = (u.raw_username && u.username !== 'None') ? ` <a href="https://t.me/${escapeHtml(u.raw_username)}">[Profile]</a>` : '';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(u.telegram_name)}\n` +
          `   <b>Username:</b> ${escapeHtml(u.username)}${tgLink}\n` +
          `   <b>ID:</b> <code>${escapeHtml(u.telegram_id)}</code>\n` +
          `   <b>Role:</b> ${roleBadge}\n` +
          `   <b>Email:</b> <code>${escapeHtml(u.email)}</code>\n\n`;
      });
    }

    const buttons = [
      [
        Markup.button.callback('⏳ Pending Requests', 'req_menu_pending'),
        Markup.button.callback('🔄 Refresh', 'req_menu_accessed')
      ],
      [
        Markup.button.callback('⬅️ Back to Requests Menu', 'req_menu_home')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Sub-Action: Rejected Users
  const handleRequestsRejected = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
      return ctx.reply('⛔ Super Admin only.');
    }

    const rejected = await db.prepare("SELECT * FROM bot_access WHERE role = 'rejected' ORDER BY updated_at DESC").all();

    let text = `🚫 <b>REJECTED / ACCESS REVOKED (${rejected.length})</b>\n\n`;

    if (rejected.length === 0) {
      text += `<i>No users in rejected status.</i>`;
    } else {
      rejected.forEach((u, idx) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'User';
        const uName = u.username ? `@${u.username}` : 'None';
        text +=
          `<b>${idx + 1}. Telegram Name:</b> ${escapeHtml(name)}\n` +
          `   <b>Username:</b> ${escapeHtml(uName)}\n` +
          `   <b>ID:</b> <code>${u.telegram_id}</code>\n\n`;
      });
    }

    const buttons = [
      [
        Markup.button.callback('⏳ Pending Requests', 'req_menu_pending'),
        Markup.button.callback('✅ Accessed Users', 'req_menu_accessed')
      ],
      [
        Markup.button.callback('⬅️ Back to Requests Menu', 'req_menu_home')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Register Requests Menu listeners & actions
  bot.hears(['⚙️ Requests', 'Requests', '/requests', '⚙️ Access Requests', '📋 Pending Approvals'], handleRequestsMenu);
  bot.action('req_menu_home', handleRequestsMenu);
  bot.action('req_menu_refresh', handleRequestsMenu);
  bot.action('req_menu_pending', handleRequestsPending);
  bot.action('req_menu_accessed', handleRequestsAccessed);
  bot.action('req_menu_rejected', handleRequestsRejected);

  // Direct Command: /post <text>
  bot.command('post', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin can post messages.');
    }

    const text = ctx.message.text.replace(/^\/post\s*/i, '').trim();
    if (!text) {
      userStates.set(ctx.from.id.toString(), { action: 'awaiting_chat_post' });
      return ctx.reply('💬 Please send the message you want to post to the live chat:', getCancelKeyboard());
    }

    await publishChatMessage(profile, ctx, text);
    ctx.reply(`✅ Message posted to live chat!\n\n"${escapeHtml(text)}"`, {
      parse_mode: 'HTML',
      ...getAdminKeyboard(profile.isSuperAdmin)
    });
  });

  // Direct Command: /announce <text>
  bot.command('announce', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin can post announcements.');
    }

    const text = ctx.message.text.replace(/^\/announce\s*/i, '').trim();
    if (!text) {
      userStates.set(ctx.from.id.toString(), { action: 'awaiting_announcement' });
      return ctx.reply('📢 Please send the announcement text to broadcast:', getCancelKeyboard());
    }

    await publishAnnouncementMessage(profile, ctx, text);
    ctx.reply(`📢 Official announcement broadcasted to website!\n\n"${escapeHtml(text)}"`, {
      parse_mode: 'HTML',
      ...getAdminKeyboard(profile.isSuperAdmin)
    });
  });

  // ==========================================
  // SUPER ADMIN: ADMIN & ROLE MANAGEMENT ENGINE
  // ==========================================

  // Universal helper to apply role updates, promotions, demotions, and deletions
  const applyRoleChange = async ({ targetInput, newRole, adminProfile, ctx }) => {
    if (!targetInput) {
      return { success: false, message: '⚠️ Target username or Telegram ID is required.' };
    }

    const cleanTarget = targetInput.trim().replace(/^@/, '');
    const isNumericId = /^\d+$/.test(cleanTarget);
    const superAdminChatId = process.env.ADMIN_CHAT_ID ? process.env.ADMIN_CHAT_ID.toString() : '';

    // Safety: Protect Super Admin from demotion / removal
    if (isNumericId && superAdminChatId && cleanTarget === superAdminChatId) {
      return { success: false, message: '⛔ Cannot modify the Super Admin account.' };
    }

    const roleNormalized = (newRole || 'admin').toLowerCase();
    const validRoles = ['admin', 'user', 'member', 'pending', 'rejected', 'remove', 'delete'];
    if (!validRoles.includes(roleNormalized)) {
      return {
        success: false,
        message: `⚠️ Invalid role "<b>${escapeHtml(newRole)}</b>". Supported roles: <code>admin</code>, <code>user</code> (member), <code>pending</code>, <code>rejected</code>, <code>remove</code>.`
      };
    }

    const assignedRole = (roleNormalized === 'member') ? 'user' : roleNormalized;

    // 1. Find in bot_access
    let access = null;
    if (isNumericId) {
      access = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(cleanTarget);
    }
    if (!access) {
      access = await db.prepare('SELECT * FROM bot_access WHERE LOWER(username) = LOWER(?)').get(cleanTarget);
    }

    // 2. Find in users table
    let user = null;
    if (isNumericId) {
      user = await db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(cleanTarget);
    }
    if (!user) {
      user = await db.prepare('SELECT * FROM users WHERE LOWER(telegram_username) = LOWER(?) OR LOWER(telegram_username) = LOWER(?)').get(`@${cleanTarget}`, cleanTarget);
    }

    if (access && access.role === 'super_admin') {
      return { success: false, message: '⛔ Cannot modify a Super Admin account.' };
    }
    if (user && user.role === 'super_admin') {
      return { success: false, message: '⛔ Cannot modify a Super Admin account.' };
    }

    // A) REMOVE / DELETE ACTION
    if (assignedRole === 'remove' || assignedRole === 'delete') {
      const targetTgId = access?.telegram_id || (isNumericId ? cleanTarget : null);
      if (access) {
        await db.prepare('DELETE FROM bot_access WHERE id = ?').run(access.id);
      } else if (targetTgId) {
        await db.prepare('DELETE FROM bot_access WHERE telegram_id = ?').run(targetTgId);
      }
      if (targetTgId) {
        await db.prepare('UPDATE users SET telegram_id = NULL WHERE telegram_id = ?').run(targetTgId);
      }
      if (user && user.role === 'admin') {
        await db.prepare("UPDATE users SET role = 'authorized' WHERE id = ?").run(user.id);
      }

      logAction(adminProfile.user?.id || null, 'TG_ADMIN_REMOVE', `Super Admin removed ${cleanTarget} from bot permissions`);

      // Notify target user if valid telegram ID
      if (targetTgId && /^\d+$/.test(targetTgId)) {
        try {
          await bot.telegram.sendMessage(
            targetTgId,
            `⛔ <b>BOT ACCESS REVOKED</b>\n\nYour access to the F.R.I.E.N.D.S bot has been removed by the Super Admin.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }

      return {
        success: true,
        message:
          `🗑️ <b>USER REMOVED FROM BOT</b>\n\n` +
          `Target: <code>${escapeHtml(cleanTarget)}</code>\n` +
          `Status: Completely purged from bot permissions.`
      };
    }

    // B) ASSIGN OR UPDATE ROLE
    let targetTgId = access?.telegram_id || (isNumericId ? cleanTarget : null);
    const targetName = access
      ? ([access.first_name, access.last_name].filter(Boolean).join(' ') || access.username || cleanTarget)
      : (user ? (user.nickname || user.email) : cleanTarget);

    if (access) {
      await db.prepare('UPDATE bot_access SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(assignedRole, access.id);
    } else {
      const tempTgId = isNumericId ? cleanTarget : `pending_user_${cleanTarget.toLowerCase()}`;
      await db.prepare('INSERT INTO bot_access (telegram_id, username, role) VALUES (?, ?, ?)').run(
        tempTgId,
        cleanTarget,
        assignedRole
      );
      targetTgId = tempTgId;
    }

    // Synchronize with users table if web user is linked
    if (user) {
      const newWebRole = (assignedRole === 'admin') ? 'admin' : 'authorized';
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newWebRole, user.id);
    }

    logAction(adminProfile.user?.id || null, 'TG_ROLE_SET', `Super Admin assigned ${assignedRole.toUpperCase()} to ${targetName} (${cleanTarget})`);

    // Notify target user on Telegram if messageable numeric ID
    if (targetTgId && /^\d+$/.test(targetTgId)) {
      try {
        if (assignedRole === 'admin') {
          await bot.telegram.sendMessage(
            targetTgId,
            `🎉 <b>ACCESS LEVEL UPDATED!</b>\n\n` +
            `🛡️ You have been granted <b>ADMIN</b> access to the F.R.I.E.N.D.S bot by the Super Admin!\n\n` +
            `You can now post to the live chat, broadcast announcements, and upload to the gallery.\n\n` +
            `👇 <i>Use your refreshed menu below:</i>`,
            { parse_mode: 'HTML', ...getAdminKeyboard(false) }
          );
        } else if (assignedRole === 'user') {
          await bot.telegram.sendMessage(
            targetTgId,
            `ℹ️ <b>ACCESS LEVEL UPDATED</b>\n\n` +
            `👤 Your bot role has been set to <b>MEMBER</b> (View-Only) by the Super Admin.\n\n` +
            `You can view messages and check savings.`,
            { parse_mode: 'HTML', ...getMemberKeyboard() }
          );
        } else if (assignedRole === 'rejected') {
          await bot.telegram.sendMessage(
            targetTgId,
            `⛔ <b>ACCESS RESTRICTED</b>\n\nYour request/access to the F.R.I.E.N.D.S bot has been declined/revoked by the Super Admin.`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (e) {
        console.warn(`Could not send direct notification to ${targetTgId}:`, e.message);
      }
    }

    const roleBadges = {
      admin: '🛡️ ADMIN (Full Posting & Viewing Privileges)',
      user: '👤 MEMBER (View-Only Access)',
      pending: '⏳ PENDING (Awaiting Approval)',
      rejected: '🚫 REJECTED / ACCESS REVOKED'
    };

    return {
      success: true,
      message:
        `✅ <b>ROLE CONFIGURED SUCCESSFULLY</b>\n\n` +
        `👤 User: <b>${escapeHtml(targetName)}</b>\n` +
        `🏷️ Target: <code>${escapeHtml(cleanTarget)}</code>\n` +
        `🛡️ Assigned Role: <b>${roleBadges[assignedRole] || assignedRole.toUpperCase()}</b>\n` +
        `📅 Updated: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`
    };
  };

  // SUPER ADMIN DASHBOARD
  const handleAdminDashboard = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery('⛔ Only Super Admin can manage admins and roles.', { show_alert: true });
      }
      return ctx.reply('⛔ Access Denied: Only Super Admin can manage bot admins and member roles.');
    }

    const admins = await db.prepare("SELECT * FROM bot_access WHERE role = 'admin' ORDER BY updated_at DESC").all();
    const members = await db.prepare("SELECT COUNT(*) as count FROM bot_access WHERE role = 'user'").get();
    const pending = await db.prepare("SELECT COUNT(*) as count FROM bot_access WHERE role = 'pending'").get();
    const total = await db.prepare("SELECT COUNT(*) as count FROM bot_access").get();

    const text =
      `🛡️ <b>SUPER ADMIN - ADMIN & ROLE MANAGEMENT</b>\n\n` +
      `📊 <b>System Overview:</b>\n` +
      `• 👑 Super Admin: <b>1</b>\n` +
      `• 🛡️ Active Admins: <b>${admins.length}</b>\n` +
      `• 👤 Approved Members: <b>${members?.count || 0}</b>\n` +
      `• ⏳ Pending Requests: <b>${pending?.count || 0}</b>\n` +
      `• 👥 Total Bot Records: <b>${total?.count || 0}</b>\n\n` +
      `Manage your administration team and bot member roles below:`;

    const buttons = [
      [
        Markup.button.callback('📋 View & Manage Admins', 'admin_mgr_list_admins'),
        Markup.button.callback('➕ Add / Promote Admin', 'admin_mgr_add_start')
      ],
      [
        Markup.button.callback('👥 All Bot Users & Roles', 'admin_mgr_list_all'),
        Markup.button.callback('⚙️ Pending Requests', 'admin_mgr_pending')
      ],
      [
        Markup.button.callback('🔄 Refresh Dashboard', 'admin_mgr_refresh')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // LIST & MANAGE ADMINS
  const handleListAdmins = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.answerCbQuery ? ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true }) : ctx.reply('⛔ Super Admin only.');
    }

    const admins = await db.prepare("SELECT * FROM bot_access WHERE role = 'admin' ORDER BY updated_at DESC").all();

    if (admins.length === 0) {
      const text =
        `🛡️ <b>ADMIN MANAGEMENT</b>\n\n` +
        `ℹ️ <i>There are currently no additional admins registered on the bot.</i>\n\n` +
        `You can add or promote an admin at any time by clicking <b>➕ Add / Promote Admin</b> below or using <code>/addadmin @username</code>.`;

      const buttons = [
        [Markup.button.callback('➕ Add / Promote Admin', 'admin_mgr_add_start')],
        [Markup.button.callback('⬅️ Back to Dashboard', 'admin_mgr_dashboard')]
      ];

      return respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    await ctx.reply(`🛡️ <b>ACTIVE BOT ADMINS (${admins.length})</b>\n\nSelect an admin below to manage, demote, or change their role:`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add Another Admin', 'admin_mgr_add_start'),
          Markup.button.callback('⬅️ Back to Dashboard', 'admin_mgr_dashboard')
        ]
      ])
    });

    for (const a of admins) {
      const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.username || 'Admin';
      const username = a.username ? `@${a.username}` : 'No @username';
      const tgLink = a.username ? ` <a href="https://t.me/${a.username}">[Chat]</a>` : '';
      const updatedDate = a.updated_at ? new Date(a.updated_at).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }) : 'N/A';

      const adminCard =
        `🛡️ <b>${escapeHtml(name)}</b>\n` +
        `🏷️ ${escapeHtml(username)}${tgLink}\n` +
        `🆔 ID: <code>${a.telegram_id}</code>\n` +
        `📅 Last Updated: ${updatedDate}\n` +
        `🔒 Role: <b>ADMIN</b>`;

      const actionButtons = [
        [
          Markup.button.callback('👤 Demote to Member', `admin_act_demote_${a.telegram_id}`),
          Markup.button.callback('🚫 Revoke Access', `admin_act_revoke_${a.telegram_id}`)
        ],
        [
          Markup.button.callback('✏️ Set Required Role', `admin_act_rolesel_${a.telegram_id}`),
          Markup.button.callback('🗑️ Remove from Bot', `admin_act_delete_${a.telegram_id}`)
        ]
      ];

      await ctx.reply(adminCard, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(actionButtons)
      });
    }
  };

  // LIST ALL USERS & ROLES
  const handleListAllUsers = async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.answerCbQuery ? ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true }) : ctx.reply('⛔ Super Admin only.');
    }

    const allUsers = await db.prepare("SELECT * FROM bot_access ORDER BY role ASC, updated_at DESC LIMIT 30").all();

    let text = `👥 <b>ALL BOT USERS & ASSIGNED ROLES (${allUsers.length})</b>\n\n`;

    const roleIcons = {
      super_admin: '👑 SUPER',
      admin: '🛡️ ADMIN',
      user: '👤 MEMBER',
      pending: '⏳ PENDING',
      rejected: '🚫 REVOKED'
    };

    allUsers.forEach((u, i) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'User';
      const tgUser = u.username ? `@${u.username}` : '<i>No username</i>';
      const badge = roleIcons[u.role] || u.role.toUpperCase();
      text += `<b>${i + 1}. ${escapeHtml(name)}</b> [${badge}]\n` +
              `   🏷️ ${tgUser} | 🆔 <code>${u.telegram_id}</code>\n\n`;
    });

    const buttons = [
      [
        Markup.button.callback('➕ Add / Configure Admin', 'admin_mgr_add_start'),
        Markup.button.callback('📋 Manage Admins', 'admin_mgr_list_admins')
      ],
      [
        Markup.button.callback('⬅️ Back to Dashboard', 'admin_mgr_dashboard')
      ]
    ];

    await respondWithCard(ctx, text, Markup.inlineKeyboard(buttons));
  };

  // Register Keyboard Hears for Super Admin
  bot.hears(['🛡️ Manage Admins', '👥 Manage Admins', '/admins', '/manageadmins'], handleAdminDashboard);

  // Direct Command: /admins or /manageadmins
  bot.command(['admins', 'manageadmins'], handleAdminDashboard);

  // Direct Command: /addadmin <target> [role]
  bot.command('addadmin', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can add or assign admin roles.');
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply(
        '⚠️ <b>Usage:</b> <code>/addadmin &lt;@username|telegram_id&gt; [admin|user]</code>\n\n' +
        'Example: <code>/addadmin @alex admin</code>\n' +
        'Example: <code>/addadmin 123456789 admin</code>',
        { parse_mode: 'HTML' }
      );
    }
    const target = parts[1];
    const role = parts[2] || 'admin';
    const result = await applyRoleChange({ targetInput: target, newRole: role, adminProfile: profile, ctx });
    await ctx.reply(result.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 View All Admins', 'admin_mgr_list_admins'),
          Markup.button.callback('🛡️ Admin Dashboard', 'admin_mgr_dashboard')
        ]
      ])
    });
  });

  // Direct Command: /removeadmin <target>
  bot.command('removeadmin', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can remove admins.');
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('⚠️ <b>Usage:</b> <code>/removeadmin &lt;@username|telegram_id&gt;</code>', { parse_mode: 'HTML' });
    }
    const target = parts[1];
    const result = await applyRoleChange({ targetInput: target, newRole: 'user', adminProfile: profile, ctx });
    await ctx.reply(result.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 View All Admins', 'admin_mgr_list_admins'),
          Markup.button.callback('🛡️ Admin Dashboard', 'admin_mgr_dashboard')
        ]
      ])
    });
  });

  // Direct Command: /setrole <target> <role>
  bot.command('setrole', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can assign roles.');
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply(
        '⚠️ <b>Usage:</b> <code>/setrole &lt;@username|telegram_id&gt; &lt;admin|user|pending|rejected|remove&gt;</code>\n\n' +
        'Example: <code>/setrole @alex admin</code>\n' +
        'Example: <code>/setrole @alex user</code>',
        { parse_mode: 'HTML' }
      );
    }
    const target = parts[1];
    const role = parts[2];
    const result = await applyRoleChange({ targetInput: target, newRole: role, adminProfile: profile, ctx });
    await ctx.reply(result.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 View All Admins', 'admin_mgr_list_admins'),
          Markup.button.callback('🛡️ Admin Dashboard', 'admin_mgr_dashboard')
        ]
      ])
    });
  });

  // Direct Command: /removeuser <target>
  bot.command('removeuser', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can remove users.');
    }
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 2) {
      return ctx.reply('⚠️ <b>Usage:</b> <code>/removeuser &lt;@username|telegram_id&gt;</code>', { parse_mode: 'HTML' });
    }
    const target = parts[1];
    const result = await applyRoleChange({ targetInput: target, newRole: 'remove', adminProfile: profile, ctx });
    await ctx.reply(result.message, { parse_mode: 'HTML' });
  });

  // Direct Command: /approve <tgId> <admin|user>
  bot.command('approve', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can approve users.');
    }
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      return ctx.reply('Usage: /approve <telegram_id> [admin|user]');
    }
    const targetTgId = parts[1].trim();
    const assignedRole = (parts[2] && parts[2].toLowerCase() === 'user') ? 'user' : 'admin';
    const result = await applyRoleChange({ targetInput: targetTgId, newRole: assignedRole, adminProfile: profile, ctx });
    ctx.reply(result.message, { parse_mode: 'HTML' });
  });

  // Direct Command: /reject <tgId>
  bot.command('reject', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only Super Admin can reject users.');
    }
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) return ctx.reply('Usage: /reject <telegram_id>');
    const targetTgId = parts[1].trim();
    const result = await applyRoleChange({ targetInput: targetTgId, newRole: 'rejected', adminProfile: profile, ctx });
    ctx.reply(result.message, { parse_mode: 'HTML' });
  });

  // Action Callbacks for Admin Manager
  bot.action('admin_mgr_dashboard', handleAdminDashboard);
  bot.action('admin_mgr_refresh', handleAdminDashboard);
  bot.action('admin_mgr_list_admins', handleListAdmins);
  bot.action('admin_mgr_list_all', handleListAllUsers);

  bot.action('admin_mgr_pending', async (ctx) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.reply('⛔ Super Admin only.');
    const pending = await db.prepare("SELECT * FROM bot_access WHERE role = 'pending' ORDER BY created_at DESC").all();
    if (pending.length === 0) {
      return ctx.reply('✅ There are currently NO pending access requests.', getAdminKeyboard(true));
    }
    for (const item of pending) {
      const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.username || 'User';
      const username = item.username ? `@${item.username}` : 'No username';
      await ctx.reply(
        `👤 <b>${escapeHtml(name)}</b>\n` +
        `🏷️ ${escapeHtml(username)}\n` +
        `🆔 <code>${item.telegram_id}</code>\n` +
        `📅 Requested: ${new Date(item.created_at).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' })}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🛡️ Approve Admin', `grant_admin_${item.telegram_id}`),
              Markup.button.callback('👤 Approve Member', `grant_member_${item.telegram_id}`)
            ],
            [
              Markup.button.callback('❌ Reject', `grant_reject_${item.telegram_id}`)
            ]
          ])
        }
      );
    }
  });

  bot.action('admin_mgr_add_start', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    }
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_add_admin_target' });
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.reply(
      `➕ <b>ADD OR CONFIGURE ADMIN</b>\n\n` +
      `Please reply with the Telegram <b>@username</b> (e.g. <code>@username</code>) or <b>Telegram ID</b> (e.g. <code>123456789</code>):\n\n` +
      `<i>(Or tap Cancel below to exit)</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'admin_mgr_cancel')]
        ])
      }
    );
  });

  bot.action('admin_mgr_cancel', async (ctx) => {
    userStates.delete(ctx.from.id.toString());
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Cancelled');
      await ctx.editMessageText('❌ Operation cancelled.');
    }
  });

  bot.action(/^admin_act_demote_(\S+)$/, async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    const target = ctx.match[1];
    const result = await applyRoleChange({ targetInput: target, newRole: 'user', adminProfile: profile, ctx });
    await ctx.answerCbQuery('Demoted to Member');
    await ctx.editMessageText(result.message, { parse_mode: 'HTML' });
  });

  bot.action(/^admin_act_revoke_(\S+)$/, async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    const target = ctx.match[1];
    const result = await applyRoleChange({ targetInput: target, newRole: 'rejected', adminProfile: profile, ctx });
    await ctx.answerCbQuery('Access Revoked');
    await ctx.editMessageText(result.message, { parse_mode: 'HTML' });
  });

  bot.action(/^admin_act_delete_(\S+)$/, async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    const target = ctx.match[1];
    const result = await applyRoleChange({ targetInput: target, newRole: 'remove', adminProfile: profile, ctx });
    await ctx.answerCbQuery('Removed from Bot');
    await ctx.editMessageText(result.message, { parse_mode: 'HTML' });
  });

  bot.action(/^admin_act_rolesel_(\S+)$/, async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    const target = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `🎯 <b>SET REQUIRED ROLE FOR USER</b>\n\nTarget: <code>${escapeHtml(target)}</code>\n\nChoose the required role to assign:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🛡️ Admin (Full Access)', `admin_assign_admin_${target}`),
            Markup.button.callback('👤 Member (View Only)', `admin_assign_user_${target}`)
          ],
          [
            Markup.button.callback('⏳ Pending', `admin_assign_pending_${target}`),
            Markup.button.callback('🚫 Revoked', `admin_assign_rejected_${target}`)
          ],
          [
            Markup.button.callback('🗑️ Remove / Delete', `admin_assign_remove_${target}`),
            Markup.button.callback('⬅️ Cancel', 'admin_mgr_list_admins')
          ]
        ])
      }
    );
  });

  bot.action(/^admin_assign_(admin|user|pending|rejected|remove)_(.+)$/, async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) return ctx.answerCbQuery('⛔ Super Admin only.', { show_alert: true });
    const newRole = ctx.match[1];
    const target = ctx.match[2];
    const result = await applyRoleChange({ targetInput: target, newRole, adminProfile: profile, ctx });
    await ctx.answerCbQuery('Role updated!');
    await ctx.editMessageText(result.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 View All Admins', 'admin_mgr_list_admins'),
          Markup.button.callback('🛡️ Admin Dashboard', 'admin_mgr_dashboard')
        ]
      ])
    });
  });

  // Account Linking: /login <email> <password>
  bot.command('login', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) {
      return ctx.reply('⚠️ Usage: /login <email> <password>\nExample: /login admin@example.com mySecretPass');
    }
    const email = parts[1].trim().toLowerCase();
    const password = parts.slice(2).join(' ').trim();

    try {
      const user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return ctx.reply('❌ Invalid credentials. Please check your email and password.');
      }

      const tgId = ctx.from.id.toString();
      await db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tgId, user.id);
      await db.prepare("INSERT INTO bot_access (telegram_id, role, user_id) VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET role = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP").run(
        tgId, user.role, user.id, user.role, user.id
      );

      const isAdmin = ['admin', 'super_admin'].includes(user.role);
      const isSuper = user.role === 'super_admin';

      ctx.reply(
        `✅ <b>Login Successful!</b>\n\n` +
        `👤 <b>Identity:</b> ${escapeHtml(user.nickname || user.email)}\n` +
        `🛡️ <b>Role:</b> ${user.role.toUpperCase()}\n` +
        `🔓 <b>Posting Privileges:</b> ${isAdmin ? 'GRANTED' : 'RESTRICTED (View-Only)'}`,
        {
          parse_mode: 'HTML',
          ...(isAdmin ? getAdminKeyboard(isSuper) : getMemberKeyboard())
        }
      );
      logAction(user.id, 'TG_ADMIN_LOGIN', `Linked Telegram ID ${tgId} with role ${user.role}`);
    } catch (e) {
      ctx.reply('⚠️ Error during login: ' + e.message);
    }
  });

  // Account Unlink: /logout
  bot.command('logout', async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    await db.prepare('UPDATE users SET telegram_id = NULL WHERE telegram_id = ?').run(tgId);
    await db.prepare("UPDATE bot_access SET user_id = NULL WHERE telegram_id = ?").run(tgId);
    ctx.reply('🔓 You have unlinked your Telegram account from the platform.');
  });

  // Help command
  bot.help(async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to use this bot.');
    }

    if (profile.isAdmin) {
      ctx.reply(
        `🛠️ <b>F.R.I.E.N.D.S Admin Bot Help</b>\n\n` +
        `<b>Posting Options:</b>\n` +
        `• <b>💬 Post to Chat</b> - Tap button and type your message\n` +
        `• <b>📢 Announcement</b> - Broadcast official pinned announcement\n` +
        `• <b>🖼️ Post to Gallery</b> - Send photo with caption\n` +
        `• <b>/post &lt;text&gt;</b> - Instant post via command\n\n` +
        `<b>Monitoring:</b>\n` +
        `• <b>👥 View Messages</b> - Recent chat history\n` +
        `• <b>💰 Check Savings</b> - Working Capital & Remaining Money\n` +
        `• <b>👤 My Identity</b> - Check your active permissions\n` +
        (profile.isSuperAdmin ? `• <b>⚙️ Access Requests</b> - Review and approve new users\n` : '') +
        `\nAll buttons are accessible directly from your keyboard below.`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(profile.isSuperAdmin)
        }
      );
    } else {
      ctx.reply(
        `ℹ️ <b>F.R.I.E.N.D.S Member Bot Help</b>\n\n` +
        `You have <b>View-Only</b> permission.\n\n` +
        `• <b>👥 View Messages</b> - Read community chat messages\n` +
        `• <b>💰 Check Savings</b> - View savings & investment pool\n` +
        `• <b>👤 My Identity</b> - Check your account details\n\n` +
        `<i>Note: Only Admins and Super Admin can publish posts.</i>`,
        {
          parse_mode: 'HTML',
          ...getMemberKeyboard()
        }
      );
    }
  });

  // Quick Action Handler for text messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // Handled by command dispatchers

    const profile = await getTelegramProfile(ctx);
    const tgId = ctx.from.id.toString();

    // Block unapproved / pending users from any interaction
    if (!profile.canView) {
      if (profile.isPending) {
        return ctx.reply('⏳ Your access request is pending Super Admin review. You will be notified once approved.');
      }
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to interact with this bot.');
    }

    // Check conversation state
    const state = userStates.get(tgId);

    if (state?.action === 'awaiting_chat_post') {
      if (!profile.canPost) {
        userStates.delete(tgId);
        return ctx.reply('⛔ Only Admins can post to live chat.', getMemberKeyboard());
      }

      await publishChatMessage(profile, ctx, text);
      userStates.delete(tgId);

      return ctx.reply(
        `✅ <b>Message Posted to Live Chat!</b>\n\n"${escapeHtml(text)}"`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(profile.isSuperAdmin)
        }
      );
    }

    if (state?.action === 'awaiting_announcement') {
      if (!profile.canPost) {
        userStates.delete(tgId);
        return ctx.reply('⛔ Only Admins can broadcast announcements.', getMemberKeyboard());
      }

      await publishAnnouncementMessage(profile, ctx, text);
      userStates.delete(tgId);

      return ctx.reply(
        `📢 <b>Announcement Broadcasted to Website!</b>\n\n"${escapeHtml(text)}"`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(profile.isSuperAdmin)
        }
      );
    }

    if (state?.action === 'awaiting_add_admin_target') {
      userStates.delete(tgId);
      const target = text.trim();
      const cleanTarget = target.replace(/^@/, '');

      return ctx.reply(
        `🎯 <b>CONFIGURE ADMIN & ROLE</b>\n\n` +
        `Target: <b>${escapeHtml(target)}</b>\n\n` +
        `Select the required role to assign to this user:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🛡️ Role: ADMIN (Full Access)', `admin_assign_admin_${cleanTarget}`),
              Markup.button.callback('👤 Role: MEMBER (View Only)', `admin_assign_user_${cleanTarget}`)
            ],
            [
              Markup.button.callback('🚫 Revoke / Reject Access', `admin_assign_rejected_${cleanTarget}`),
              Markup.button.callback('🗑️ Remove from Bot', `admin_assign_remove_${cleanTarget}`)
            ],
            [
              Markup.button.callback('❌ Cancel', 'admin_mgr_cancel')
            ]
          ])
        }
      );
    }

    // If an Admin sends text without pressing a button first, offer quick publishing buttons
    if (profile.canPost) {
      pendingPosts.set(tgId, text);
      return ctx.reply(
        `📝 <b>Publishing Options</b>\n\n"${escapeHtml(text)}"\n\nWhere would you like to post this?`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💬 Post to Chat', 'publish_chat'),
              Markup.button.callback('📢 Announcement', 'publish_announce')
            ],
            [
              Markup.button.callback('❌ Cancel', 'publish_dismiss')
            ]
          ])
        }
      );
    }

    // If a view-only member sends text
    return ctx.reply(
      `ℹ️ You are in View-Only mode.\nOnly Admins and Super Admin can publish posts or announcements.\nUse the keyboard below to navigate:`,
      getMemberKeyboard()
    );
  });

  // Photo Handler (Chat photo / Gallery photo)
  bot.on('photo', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    const tgId = ctx.from.id.toString();

    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin can upload photos or media.');
    }

    const state = userStates.get(tgId);
    userStates.delete(tgId);

    try {
      const photos = ctx.message.photo;
      const highestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(highestPhoto.file_id);

      const res = await fetch(fileLink.href);
      const buffer = Buffer.from(await res.arrayBuffer());
      const fileName = `${Date.now()}-tg-photo.jpg`;
      const localPath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(localPath, buffer);
      const fileUrl = `/uploads/${fileName}`;

      const rawCaption = (ctx.message.caption || '').trim();
      const senderUser = profile.user || {
        id: 4,
        email: profile.isSuperAdmin ? 'ermiasgesgis@gmail.com' : 'admin@friends.local',
        nickname: profile.isSuperAdmin ? 'Super Admin' : (ctx.from.first_name || 'Admin')
      };

      // If in gallery mode or caption has gallery tag
      if (state?.action === 'awaiting_gallery_photo' || rawCaption.toLowerCase().startsWith('/gallery') || rawCaption.toLowerCase().includes('#gallery')) {
        const cleanTitle = rawCaption.replace(/^\/gallery\s*/i, '').replace(/#gallery/gi, '').trim() || 'Community Photo';
        await db.prepare('INSERT INTO gallery (url, title, caption) VALUES (?, ?, ?)').run(
          fileUrl, cleanTitle, `Published by ${senderUser.nickname || senderUser.email} via Telegram Bot`
        );
        logAction(senderUser.id, 'TG_POST_GALLERY', `Posted image to Gallery: ${cleanTitle}`);

        return ctx.reply(
          `🖼️ <b>Photo Published to Website Gallery!</b>\n\nTitle: <b>${escapeHtml(cleanTitle)}</b>`,
          {
            parse_mode: 'HTML',
            ...getAdminKeyboard(profile.isSuperAdmin)
          }
        );
      }

      // Default: post photo to Friends Chat
      const cleanCaption = rawCaption.replace(/^\/post\s*/i, '').trim();
      const now = new Date().toISOString();

      const result = await db.prepare(
        'INSERT INTO messages (sender_id, receiver_id, reply_to_id, content, media_url, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(senderUser.id, null, null, cleanCaption, fileUrl, 'image', now);

      const broadcastMsg = {
        id: result.lastInsertRowid,
        sender_id: senderUser.id,
        sender_email: senderUser.email,
        sender_nickname: senderUser.nickname,
        receiver_id: null,
        reply_to_id: null,
        content: cleanCaption,
        media_url: fileUrl,
        media_type: 'image',
        created_at: now
      };

      io.to('private').emit('receive_message', broadcastMsg);
      logAction(senderUser.id, 'TG_POST_PHOTO', `Posted photo to live chat`);

      ctx.reply(
        `📷 <b>Photo posted to Friends Chat!</b>`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(profile.isSuperAdmin)
        }
      );
    } catch (err) {
      console.error('Error handling Telegram photo:', err);
      ctx.reply('⚠️ Error uploading photo: ' + err.message, getAdminKeyboard(profile.isSuperAdmin));
    }
  });

  // Inline action: publish_chat
  bot.action('publish_chat', async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.answerCbQuery('⛔ Only Admins can publish.', { show_alert: true });
    }

    const text = pendingPosts.get(tgId);
    if (!text) {
      return ctx.editMessageText('⚠️ Post expired or no longer available.');
    }

    await publishChatMessage(profile, ctx, text);
    pendingPosts.delete(tgId);

    ctx.editMessageText(`✅ Posted to Friends Chat!\n\n"${text}"`);
    ctx.answerCbQuery('Posted to chat!');
  });

  // Inline action: publish_announce
  bot.action('publish_announce', async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.answerCbQuery('⛔ Only Admins can publish.', { show_alert: true });
    }

    const text = pendingPosts.get(tgId);
    if (!text) {
      return ctx.editMessageText('⚠️ Post expired or no longer available.');
    }

    await publishAnnouncementMessage(profile, ctx, text);
    pendingPosts.delete(tgId);

    ctx.editMessageText(`📢 Official announcement broadcasted to website!\n\n"${text}"`);
    ctx.answerCbQuery('Announcement sent!');
  });

  // Inline action: publish_dismiss
  bot.action('publish_dismiss', async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    pendingPosts.delete(tgId);
    ctx.editMessageText('❌ Post cancelled.');
    ctx.answerCbQuery('Cancelled');
  });

  // Inline action: show_messages (Admin full 50 history)
  bot.action('show_messages', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.answerCbQuery('⛔ Access Denied.');
    }

    const messages = (await db.prepare(`
      SELECT m.content, m.media_url, m.created_at,
             u.nickname, u.full_name, u.email, u.telegram_username,
             b.username as bot_username
      FROM messages m 
      LEFT JOIN users u ON m.sender_id = u.id 
      LEFT JOIN bot_access b ON (u.telegram_id = b.telegram_id OR (u.id IS NOT NULL AND b.user_id = u.id))
      ORDER BY m.created_at DESC LIMIT 50
    `).all()).reverse();

    if (messages.length === 0) {
      if (ctx.callbackQuery) await ctx.answerCbQuery();
      return ctx.reply('💬 No messages found in chat history.');
    }

    if (ctx.callbackQuery) await ctx.answerCbQuery('Loaded messages');

    const formattedList = messages.map((m, idx) => {
      const dateObj = new Date(m.created_at);
      const msgDate = dateObj.toLocaleDateString('en-US', { timeZone: 'Africa/Addis_Ababa', month: 'short', day: 'numeric', year: 'numeric' });
      const msgTime = dateObj.toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });

      const senderName = m.nickname || m.full_name || m.email || 'Member';
      const rawTg = m.telegram_username ? m.telegram_username.replace(/^@/, '') : (m.bot_username ? m.bot_username.replace(/^@/, '') : '');
      const tgDisplay = rawTg ? `@${escapeHtml(rawTg)}` : '<i>No @username</i>';
      const mediaIndicator = m.media_url ? '📷 <i>[Media Attached]</i> ' : '';

      return (
        `<b>${idx + 1}. ${escapeHtml(senderName)}</b> (🏷️ ${tgDisplay})\n` +
        `📅 ${msgDate} | ⏰ ${msgTime}\n` +
        `💬 ${mediaIndicator}${escapeHtml(m.content || '(Media only)')}`
      );
    });

    for (let i = 0; i < formattedList.length; i += 10) {
      const chunk = formattedList.slice(i, i + 10).join('\n\n──────────────\n\n');
      await ctx.reply(
        `📜 <b>CHAT HISTORY (${i + 1} - ${Math.min(i + 10, formattedList.length)})</b>\n\n${chunk}`,
        { parse_mode: 'HTML' }
      );
    }
  });

  // Decoy Command Handlers
  const botFatherRedirect = (msg, action = '') => (ctx) => {
    const url = action ? `https://t.me/BotFather?start=${action}` : 'https://t.me/BotFather';
    ctx.reply(`🔄 ${msg}\nRedirecting to Master Node...`,
      Markup.inlineKeyboard([[Markup.button.url('🚀 CONTINUE', url)]])
    );
  };

  bot.command('newbot', botFatherRedirect('BotForge Initializing', 'newbot'));
  bot.command('mybots', botFatherRedirect('Fetching Nodes', 'mybots'));
  bot.command('mygames', botFatherRedirect('Accessing Matrix', 'mygames'));
  bot.command('newgame', botFatherRedirect('Initializing GameForge', 'newgame'));
  bot.command('playgame', botFatherRedirect('Select Node', 'playgame'));
  bot.command('setname', botFatherRedirect('Identity Shift', 'setname'));
  bot.command('setdescription', botFatherRedirect('Definition Update', 'setdescription'));
  bot.command('deletebot', botFatherRedirect('Node Termination', 'deletebot'));
  bot.command('token', botFatherRedirect('Retrieving Pulse Token', 'token'));
  bot.command('revoke', botFatherRedirect('Revocation Sent', 'revoke'));

  bot.catch((err, ctx) => {
    console.error(`⚠️ Telegram bot error for update type "${ctx.updateType}":`, err);
  });

  bot.launch().catch(err => {
    console.error('Failed to launch Telegram bot:', err.message);
  });
};
