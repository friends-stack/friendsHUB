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
      ['💬 Post to Chat', '📢 Announcement'],
      ['🖼️ Post to Gallery', '👥 View Messages'],
      ['💰 Check Savings', '👤 My Identity']
    ];
    if (isSuperAdmin) {
      buttons.push(['⚙️ Access Requests', '📋 Pending Approvals']);
    }
    return Markup.keyboard(buttons).resize();
  };

  const getMemberKeyboard = () => {
    return Markup.keyboard([
      ['👥 View Messages', '💰 Check Savings'],
      ['👤 My Identity', 'ℹ️ Help']
    ]).resize();
  };

  const getCancelKeyboard = () => {
    return Markup.keyboard([
      ['❌ Cancel']
    ]).resize();
  };

  // Resolve user profile, role, and permissions
  const getTelegramProfile = async (ctx) => {
    const tgId = ctx.from?.id?.toString();
    if (!tgId) return null;

    const isSuperAdminEnv = (process.env.ADMIN_CHAT_ID && tgId === process.env.ADMIN_CHAT_ID.toString());

    // 1. Check or seed bot_access record
    let access = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(tgId);
    if (isSuperAdminEnv) {
      if (!access) {
        await db.prepare('INSERT INTO bot_access (telegram_id, first_name, username, role) VALUES (?, ?, ?, ?)').run(
          tgId,
          ctx.from.first_name || 'Super Admin',
          ctx.from.username || 'SuperAdmin',
          'super_admin'
        );
        access = await db.prepare('SELECT * FROM bot_access WHERE telegram_id = ?').get(tgId);
      } else if (access.role !== 'super_admin') {
        await db.prepare("UPDATE bot_access SET role = 'super_admin' WHERE telegram_id = ?").run(tgId);
        access.role = 'super_admin';
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
    if (!user && ctx.from?.username) {
      const usernameWithAt = '@' + ctx.from.username.replace(/^@/, '');
      user = await db.prepare('SELECT * FROM users WHERE telegram_username = ? OR telegram_username = ?').get(usernameWithAt, ctx.from.username);
      if (user) {
        await db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tgId, user.id);
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
    { command: 'start', description: 'Start the bot and open menu' },
    { command: 'post', description: 'Post text to website live chat' },
    { command: 'announce', description: 'Broadcast announcement to site' },
    { command: 'messages', description: 'View latest messages from site' },
    { command: 'savings', description: 'Check savings & investments overview' },
    { command: 'whoami', description: 'Check your access permissions' },
    { command: 'requests', description: 'Super Admin: review access requests' },
    { command: 'help', description: 'Show all bot commands and buttons' }
  ]).catch(console.error);

  // START HANDLER: Handles new user access requests and Super Admin notifications
  bot.start(async (ctx) => {
    const tgId = ctx.from.id.toString();
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'Friend';
    const profile = await getTelegramProfile(ctx);

    if (profile.isSuperAdmin) {
      return ctx.reply(
        `👑 <b>Welcome, Super Admin ${escapeHtml(name)}!</b>\n\n` +
        `🛡️ <b>Role:</b> SUPER ADMIN\n` +
        `✅ You have full platform authority. You can post directly to the website live chat, broadcast announcements, and approve/reject new user access requests.\n\n` +
        `👇 <b>Use the persistent buttons below to take action:</b>`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(true)
        }
      );
    }

    if (profile.isAdmin) {
      return ctx.reply(
        `🛡️ <b>Welcome, Admin ${escapeHtml(name)}!</b>\n\n` +
        `Role: <b>ADMIN</b>\n` +
        `✅ Permissions: Full Posting Privileges Granted (Chat, Announcements, Gallery).\n\n` +
        `👇 <b>Use the persistent buttons below to post or view messages:</b>`,
        {
          parse_mode: 'HTML',
          ...getAdminKeyboard(false)
        }
      );
    }

    if (profile.canView && profile.role === 'user') {
      return ctx.reply(
        `👋 <b>Welcome back, ${escapeHtml(name)}!</b>\n\n` +
        `👤 <b>Role:</b> APPROVED MEMBER (View-Only)\n` +
        `✅ Permissions: You can view messages, savings data, and platform status.\n\n` +
        `ℹ️ Note: Only Admins and Super Admin can post messages to the website live chat.`,
        {
          parse_mode: 'HTML',
          ...getMemberKeyboard()
        }
      );
    }

    if (profile.isPending) {
      return ctx.reply(
        `⏳ <b>ACCESS REQUEST PENDING</b>\n\n` +
        `Hello ${escapeHtml(name)},\n` +
        `Your request is currently waiting for review by the Super Admin.\n\n` +
        `🔒 <b>You cannot view messages or post content until your request is approved.</b>\n\n` +
        `You will receive an instant notification right here once the Super Admin grants you access.`
      );
    }

    if (profile.isRejected) {
      return ctx.reply(
        `⛔ <b>Access Restricted</b>\n\n` +
        `Your request to access the bot was declined by the Super Admin.\n` +
        `If you believe this is an error, please contact the administrator.`
      );
    }

    // Brand new Telegram user starting the bot:
    // 1. Create a pending request in bot_access
    await db.prepare(`
      INSERT INTO bot_access (telegram_id, first_name, last_name, username, role)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(
      tgId,
      ctx.from.first_name || '',
      ctx.from.last_name || '',
      ctx.from.username || ''
    );

    // 2. Inform the user they cannot view messages until approved
    await ctx.reply(
      `👋 <b>Welcome to the F.R.I.E.N.D.S Platform Bot!</b>\n\n` +
      `🔒 <i>This platform and bot are strictly private and role-based.</i>\n\n` +
      `📨 <b>Your access request has been sent to the Super Admin.</b>\n\n` +
      `🚫 You cannot see any messages or use bot features until the Super Admin gives you permission.\n\n` +
      `Please wait for confirmation.`,
      { parse_mode: 'HTML' }
    );

    // 3. Dispatch an approval request to the Super Admin with inline action buttons
    if (process.env.ADMIN_CHAT_ID) {
      const usernameDisplay = ctx.from.username ? `@${ctx.from.username}` : 'No username';
      const adminNotice =
        `🔔 <b>NEW BOT ACCESS REQUEST</b>\n\n` +
        `👤 <b>Name:</b> ${escapeHtml(name)}\n` +
        `🏷️ <b>Username:</b> ${escapeHtml(usernameDisplay)}\n` +
        `🆔 <b>Telegram ID:</b> <code>${tgId}</code>\n` +
        `🕒 <b>Time:</b> ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true })}\n\n` +
        `This user has started the bot and is requesting permission to view messages and interact.\n` +
        `Select an action:`;

      try {
        await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminNotice, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🛡️ Approve Admin (Can Post)', `grant_admin_${tgId}`),
              Markup.button.callback('👤 Approve Member (View Only)', `grant_member_${tgId}`)
            ],
            [
              Markup.button.callback('❌ Reject Access', `grant_reject_${tgId}`)
            ]
          ])
        });
        logAction(null, 'TG_ACCESS_REQUEST_SENT', `Access request for ${name} (${tgId}) sent to Super Admin`);
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

  // BUTTON 1: '💬 Post to Chat'
  bot.hears('💬 Post to Chat', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin are permitted to post messages to the website live chat.');
    }
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_chat_post' });
    ctx.reply(
      '💬 <b>Post to Friends Chat</b>\n\n' +
      'Please send the message you want to post to the website live chat.\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
  });

  // BUTTON 2: '📢 Announcement'
  bot.hears('📢 Announcement', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin are permitted to broadcast announcements.');
    }
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_announcement' });
    ctx.reply(
      '📢 <b>Broadcast Announcement</b>\n\n' +
      'Please send the announcement text to display across the website.\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
  });

  // BUTTON 3: '🖼️ Post to Gallery'
  bot.hears('🖼️ Post to Gallery', async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canPost) {
      return ctx.reply('⛔ Access Denied: Only Admins and Super Admin are permitted to post photos to the website gallery.');
    }
    userStates.set(ctx.from.id.toString(), { action: 'awaiting_gallery_photo' });
    ctx.reply(
      '🖼️ <b>Post to Website Gallery</b>\n\n' +
      'Please send a photo with a caption or title to publish it to the Community Gallery.\n\n' +
      '<i>(Tap ❌ Cancel below if you change your mind)</i>',
      { parse_mode: 'HTML', ...getCancelKeyboard() }
    );
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

  // BUTTON 4: '👥 View Messages'
  bot.hears(['👥 View Messages', '/messages', '5'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to view messages.');
    }

    const lastMessages = (await db.prepare(`
      SELECT m.content, m.media_url, m.media_type, u.nickname, u.email, m.created_at
      FROM messages m 
      LEFT JOIN users u ON m.sender_id = u.id 
      ORDER BY m.created_at DESC LIMIT 10
    `).all()).reverse();

    if (lastMessages.length === 0) {
      return ctx.reply('💬 No messages found in the live chat.');
    }

    const historyText = lastMessages.map(m => {
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
      const sender = m.nickname || m.email || 'Admin';
      const indicator = m.media_url ? '[🖼️ Media] ' : '';
      return `💬 <b>${escapeHtml(sender)}</b> (${time}):\n${indicator}${escapeHtml(m.content || '(Media only)')}`;
    }).join('\n\n');

    const extra = profile.isAdmin ? Markup.inlineKeyboard([[Markup.button.callback('📜 Show 50 Messages', 'show_messages')]]) : undefined;

    ctx.reply(`💬 <b>LIVE CHAT RECENT MESSAGES</b>\n\n${historyText}`, { parse_mode: 'HTML', ...extra });
  });

  // BUTTON 5: '💰 Check Savings'
  bot.hears(['💰 Check Savings', '/savings'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.canView) {
      return ctx.reply('🔒 Access Denied: You must be approved by the Super Admin to view savings data.');
    }

    try {
      const members = await db.prepare('SELECT * FROM savings_members WHERE status = ?').all('active');
      const investments = await db.prepare('SELECT * FROM savings_investments').all();
      const config = await db.prepare('SELECT * FROM savings_config ORDER BY id DESC LIMIT 1').get() || { weekly_amount: 300 };

      let totalSaving = 0;
      for (const m of members) {
        const trans = await db.prepare('SELECT amount, type FROM savings_transactions WHERE member_id = ?').all(m.id);
        const paid = trans.filter(t => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);
        totalSaving += paid;
      }

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

      ctx.reply(
        `💰 <b>SAVINGS & WORKING CAPITAL OVERVIEW</b>\n\n` +
        `🟡 <b>Remaining Money:</b> ETB ${remainingMoney.toLocaleString()} (Cash & Bank)\n` +
        `🔵 <b>Money at Work:</b> ETB ${moneyAtWork.toLocaleString()} (Active Investments)\n` +
        `🟢 <b>Total Saving:</b> ETB ${totalSaving.toLocaleString()} (Cumulative Pool)\n` +
        `📈 <b>Realized Profit:</b> ETB ${completedProfits.toLocaleString()}\n` +
        `👥 <b>Active Members:</b> ${members.length}\n` +
        `📅 <b>Weekly Rate:</b> ETB ${config.weekly_amount}/wk\n\n` +
        `<i>Verified live against database.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      ctx.reply('⚠️ Error computing savings overview: ' + e.message);
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

  // BUTTON 7: Super Admin Review Pending Requests
  bot.hears(['⚙️ Access Requests', '📋 Pending Approvals', '/requests'], async (ctx) => {
    const profile = await getTelegramProfile(ctx);
    if (!profile.isSuperAdmin) {
      return ctx.reply('⛔ Only the Super Admin can review access requests.');
    }

    const pending = await db.prepare("SELECT * FROM bot_access WHERE role = 'pending' ORDER BY created_at DESC").all();
    if (pending.length === 0) {
      return ctx.reply('✅ There are currently NO pending access requests.', getAdminKeyboard(true));
    }

    ctx.reply(`📋 <b>Pending Access Requests (${pending.length})</b>:\nReview each applicant below:`, { parse_mode: 'HTML' });

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

    await db.prepare("INSERT INTO bot_access (telegram_id, role) VALUES (?, ?) ON CONFLICT(telegram_id) DO UPDATE SET role = ?, updated_at = CURRENT_TIMESTAMP").run(targetTgId, assignedRole, assignedRole);
    ctx.reply(`✅ Telegram user ${targetTgId} has been approved as ${assignedRole.toUpperCase()}.`);

    try {
      await bot.telegram.sendMessage(
        targetTgId,
        `🎉 <b>ACCESS GRANTED!</b>\n\nYou have been approved as <b>${assignedRole.toUpperCase()}</b> by the Super Admin.\nUse /start to access the menu.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {}
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

    await db.prepare("INSERT INTO bot_access (telegram_id, role) VALUES (?, 'rejected') ON CONFLICT(telegram_id) DO UPDATE SET role = 'rejected', updated_at = CURRENT_TIMESTAMP").run(targetTgId);
    ctx.reply(`❌ Telegram user ${targetTgId} access has been rejected.`);
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
      SELECT m.content, u.email, u.nickname, m.created_at 
      FROM messages m 
      LEFT JOIN users u ON m.sender_id = u.id 
      ORDER BY m.created_at DESC LIMIT 50
    `).all()).reverse();

    const msgList = messages.map(m => {
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
      const sender = m.nickname || m.email || 'Admin';
      return `💬 ${sender} (${time}): ${m.content || '(Media)'}`;
    }).join('\n');

    ctx.reply(`📜 <b>CHAT HISTORY (LAST 50)</b>\n\n${escapeHtml(msgList) || 'No messages found.'}`, { parse_mode: 'HTML' });
    ctx.answerCbQuery();
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
