const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');

// In-memory cache for deduplication and visit debouncing
const recentNotifications = new Map(); // key -> timestamp
const visitCooldowns = new Map(); // ip/userId -> timestamp
const paymentSchedules = new Map(); // schedKey -> { memberName, amount, n, saturdays, originalText, schedKey }

const DEDUPE_WINDOW_MS = 10000; // 10 seconds dedupe window for identical messages
const VISIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes visit notification cooldown

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const getAddisTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const getAddisDate = () => {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'Africa/Addis_Ababa',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Calculate n consecutive Saturdays starting from the nearest upcoming Saturday (or today if Saturday)
 */
const getConsecutiveSaturdays = (startDate, count) => {
  const d = new Date(startDate || Date.now());
  const addisStr = d.toLocaleDateString('en-US', { timeZone: 'Africa/Addis_Ababa' });
  const localD = new Date(addisStr);
  const currentDay = localD.getDay(); // 0 = Sun, 6 = Sat
  const daysUntilSaturday = (6 - currentDay + 7) % 7;
  localD.setDate(localD.getDate() + daysUntilSaturday);

  const saturdays = [];
  for (let i = 0; i < count; i++) {
    const sat = new Date(localD);
    sat.setDate(localD.getDate() + i * 7);
    saturdays.push(
      sat.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    );
  }
  return saturdays;
};

const getPaymentSchedule = (key) => paymentSchedules.get(key);

/**
 * Fetch partitioned Admin and Super Admin Telegram Chat IDs.
 */
const getSeparatedRecipients = async (db) => {
  const superAdminRecipients = new Set();
  const adminRecipients = new Set();

  if (process.env.ADMIN_CHAT_ID && process.env.ADMIN_CHAT_ID !== 'YOUR_CHAT_ID') {
    const rawId = process.env.ADMIN_CHAT_ID.toString().trim();
    if (/^-?\d+$/.test(rawId)) {
      superAdminRecipients.add(rawId);
    }
  }

  try {
    const superRows = await db.prepare(`
      SELECT telegram_id FROM bot_access WHERE role = 'super_admin' AND telegram_id IS NOT NULL
      UNION
      SELECT telegram_id FROM users WHERE role = 'super_admin' AND telegram_id IS NOT NULL
    `).all();

    if (Array.isArray(superRows)) {
      for (const row of superRows) {
        if (!row || !row.telegram_id) continue;
        const tid = row.telegram_id.toString().trim();
        if (/^-?\d+$/.test(tid)) {
          superAdminRecipients.add(tid);
        }
      }
    }

    const adminRows = await db.prepare(`
      SELECT telegram_id FROM bot_access WHERE role = 'admin' AND telegram_id IS NOT NULL
      UNION
      SELECT telegram_id FROM users WHERE role = 'admin' AND telegram_id IS NOT NULL
    `).all();

    if (Array.isArray(adminRows)) {
      for (const row of adminRows) {
        if (!row || !row.telegram_id) continue;
        const tid = row.telegram_id.toString().trim();
        if (/^-?\d+$/.test(tid) && !superAdminRecipients.has(tid)) {
          adminRecipients.add(tid);
        }
      }
    }
  } catch (err) {
    console.error('⚠️ [botNotifier] Failed to load partitioned admin recipients from DB:', err.message);
  }

  return {
    superAdminRecipients: Array.from(superAdminRecipients),
    adminRecipients: Array.from(adminRecipients),
    allRecipients: Array.from(new Set([...superAdminRecipients, ...adminRecipients]))
  };
};

/**
 * Fetch all registered Admin and Super Admin Telegram Chat IDs.
 */
const getAdminRecipients = async (db) => {
  const { allRecipients } = await getSeparatedRecipients(db);
  return allRecipients;
};

/**
 * Calculate accurate financial totals grouped by category from underlying payment records.
 */
const calculateFinancialTotals = async (db) => {
  try {
    // 1. Total received payments
    const payRow = await db.prepare(
      "SELECT COALESCE(SUM(amount::numeric), 0) as total, COUNT(*) as count FROM savings_transactions WHERE type = 'payment'"
    ).get();
    const totalReceived = parseFloat(payRow?.total || 0);
    const paymentsCount = parseInt(payRow?.count || 0, 10);

    // 2. Members and missed payments
    let members = [];
    try {
      members = await db.prepare('SELECT id, name FROM savings_members ORDER BY id ASC').all();
      if (!Array.isArray(members)) members = [];
    } catch (e) {
      members = [];
    }

    let totalOutstandingMissed = 0;
    const memberDebts = [];

    for (const m of members) {
      const pRow = await db.prepare(
        "SELECT COALESCE(SUM(amount::numeric), 0) as t FROM savings_transactions WHERE member_id = ? AND type = 'payment'"
      ).get(m.id);
      const expRow = await db.prepare(
        "SELECT COALESCE(SUM(amount::numeric), 0) as t FROM savings_transactions WHERE member_id = ? AND type IN ('missed', 'expected')"
      ).get(m.id);

      const paid = parseFloat(pRow?.t || 0);
      const expected = parseFloat(expRow?.t || 0);
      const debt = Math.max(0, expected - paid);
      totalOutstandingMissed += debt;

      memberDebts.push({
        id: m.id,
        name: m.name,
        paid,
        expected,
        debt
      });
    }

    // 3. Investments calculation
    let investments = [];
    try {
      investments = await db.prepare('SELECT * FROM savings_investments').all();
      if (!Array.isArray(investments)) investments = [];
    } catch (e) {
      investments = [];
    }

    const moneyAtWork = investments
      .filter((i) => i.status === 'active')
      .reduce((s, i) => s + parseFloat(i.allocated_amount || 0), 0);

    const completedProfits = investments
      .filter((i) => i.status === 'completed')
      .reduce((s, i) => s + parseFloat(i.profit || i.projected_profit || 0), 0);

    const completedCapital = investments
      .filter((i) => i.status === 'completed')
      .reduce((s, i) => s + parseFloat(i.allocated_amount || 0), 0);

    const remainingMoney = Math.max(0, (totalReceived + completedProfits) - moneyAtWork);

    return {
      totalReceived,
      paymentsCount,
      totalOutstandingMissed,
      moneyAtWork,
      completedProfits,
      completedCapital,
      remainingMoney,
      memberDebts,
      membersCount: members.length
    };
  } catch (err) {
    console.error('⚠️ [botNotifier] Error calculating financial totals:', err.message);
    return {
      totalReceived: 0,
      paymentsCount: 0,
      totalOutstandingMissed: 0,
      moneyAtWork: 0,
      completedProfits: 0,
      completedCapital: 0,
      remainingMoney: 0,
      memberDebts: [],
      membersCount: 0
    };
  }
};

/**
 * Calculate member's individual debt.
 */
const calculateMemberMissed = async (db, memberId) => {
  if (!memberId) return 0;
  try {
    const pRow = await db.prepare(
      "SELECT COALESCE(SUM(amount::numeric), 0) as t FROM savings_transactions WHERE member_id = ? AND type = 'payment'"
    ).get(memberId);
    const expRow = await db.prepare(
      "SELECT COALESCE(SUM(amount::numeric), 0) as t FROM savings_transactions WHERE member_id = ? AND type IN ('missed', 'expected')"
    ).get(memberId);

    const paid = parseFloat(pRow?.t || 0);
    const expected = parseFloat(expRow?.t || 0);
    return Math.max(0, expected - paid);
  } catch (err) {
    return 0;
  }
};

/**
 * Centralized function to deliver an HTML message to all Admins and Super Admin.
 * Handles deduplication, parallel async delivery, and catches errors gracefully.
 */
const sendToAllAdmins = async (bot, db, htmlMessage, extraOptions = {}) => {
  if (!bot) return { deliveredCount: 0, failedCount: 0 };

  const recipients = await getAdminRecipients(db);
  if (recipients.length === 0) {
    console.warn('⚠️ [botNotifier] No admin recipients available for notification.');
    return { deliveredCount: 0, failedCount: 0 };
  }

  // Deduplication check
  const dedupeKey = `${recipients.sort().join(',')}:${htmlMessage.substring(0, 100)}`;
  const now = Date.now();
  if (recentNotifications.has(dedupeKey)) {
    const lastSent = recentNotifications.get(dedupeKey);
    if (now - lastSent < DEDUPE_WINDOW_MS) {
      return { deliveredCount: 0, failedCount: 0, deduplicated: true };
    }
  }
  recentNotifications.set(dedupeKey, now);

  // Clean old entries in cache
  if (recentNotifications.size > 200) {
    for (const [k, v] of recentNotifications.entries()) {
      if (now - v > DEDUPE_WINDOW_MS * 2) recentNotifications.delete(k);
    }
  }

  let deliveredCount = 0;
  let failedCount = 0;

  const results = await Promise.allSettled(
    recipients.map(async (chatId) => {
      try {
        await bot.telegram.sendMessage(chatId, htmlMessage, {
          parse_mode: 'HTML',
          ...extraOptions
        });
        return { chatId, success: true };
      } catch (err) {
        console.warn(`⚠️ [botNotifier] Failed to deliver bot alert to ${chatId}:`, err.message);
        throw err;
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') deliveredCount++;
    else failedCount++;
  }

  return { deliveredCount, failedCount };
};

/**
 * Send Photo with caption to all Admins and Super Admin.
 */
const sendPhotoToAllAdmins = async (bot, db, photoSource, caption, extraOptions = {}) => {
  if (!bot) return;
  const recipients = await getAdminRecipients(db);

  await Promise.allSettled(
    recipients.map(async (chatId) => {
      try {
        await bot.telegram.sendPhoto(chatId, photoSource, {
          caption,
          parse_mode: 'HTML',
          ...extraOptions
        });
      } catch (err) {
        console.warn(`⚠️ [botNotifier] Failed to send photo to ${chatId}:`, err.message);
        // Fallback to text message
        bot.telegram.sendMessage(chatId, caption, { parse_mode: 'HTML' }).catch(() => {});
      }
    })
  );
};

/**
 * Send Document with caption to all Admins and Super Admin.
 */
const sendDocumentToAllAdmins = async (bot, db, docSource, filename, caption, extraOptions = {}) => {
  if (!bot) return;
  const recipients = await getAdminRecipients(db);

  await Promise.allSettled(
    recipients.map(async (chatId) => {
      try {
        await bot.telegram.sendDocument(chatId, docSource, {
          caption,
          filename,
          parse_mode: 'HTML',
          ...extraOptions
        });
      } catch (err) {
        console.warn(`⚠️ [botNotifier] Failed to send document to ${chatId}:`, err.message);
        bot.telegram.sendMessage(chatId, caption, { parse_mode: 'HTML' }).catch(() => {});
      }
    })
  );
};

/**
 * 1. WEBSITE VISITS NOTIFICATION
 * SUPER_ADMIN:
 * 🌐 WEBSITE VISIT
 * 👤 Visitor: Ermias Gesgis
 * 🛡️ Role: SUPER_ADMIN
 * 📱 Telegram: @Orthopia_EG
 * 📍 Page: /saving
 * 📅 Nov 20, 2026 | ⏰ 06:23 PM
 *
 * ADMIN:
 * 🌐 WEBSITE VISIT
 * 👤 Visitor: Ermias Gesgis
 * 📱 Telegram: @Orthopia_EG
 * 📅 Nov 20, 2026 | ⏰ 06:23 PM
 */
const notifyWebsiteVisit = async ({ bot, db, user, ip, path: reqPath }) => {
  if (!bot) return;

  const key = user ? `user_${user.id}` : `ip_${ip || 'anon'}`;
  const now = Date.now();
  if (visitCooldowns.has(key)) {
    const lastVisit = visitCooldowns.get(key);
    if (now - lastVisit < VISIT_COOLDOWN_MS) {
      return; // Suppress high-frequency spam within cooldown window
    }
  }
  visitCooldowns.set(key, now);

  const cleanPath = reqPath || '/';
  const time = getAddisTime();
  const date = getAddisDate();

  let superAdminText = '';
  let adminText = '';

  if (user) {
    const visitorName = user.full_name || user.nickname || user.email || 'Member';
    const role = (user.role || 'MEMBER').toUpperCase();
    const telegram = user.telegram_username ? `@${user.telegram_username.replace(/^@/, '')}` : (user.telegram_id ? `ID: ${user.telegram_id}` : 'Not linked');

    superAdminText =
      `🌐 <b>WEBSITE VISIT</b>\n\n` +
      `👤 <b>Visitor:</b> ${escapeHtml(visitorName)}\n` +
      `🛡️ <b>Role:</b> ${escapeHtml(role)}\n` +
      `📱 <b>Telegram:</b> ${escapeHtml(telegram)}\n` +
      `📍 <b>Page:</b> ${escapeHtml(cleanPath)}\n` +
      `📅 ${date} | ⏰ ${time}`;

    adminText =
      `🌐 <b>WEBSITE VISIT</b>\n\n` +
      `👤 <b>Visitor:</b> ${escapeHtml(visitorName)}\n` +
      `📱 <b>Telegram:</b> ${escapeHtml(telegram)}\n` +
      `📅 ${date} | ⏰ ${time}`;
  } else {
    superAdminText =
      `🌐 <b>WEBSITE VISIT</b>\n\n` +
      `👤 <b>Visitor:</b> Guest / External Visitor\n` +
      `🛡️ <b>Role:</b> GUEST\n` +
      `📱 <b>Telegram:</b> Not linked\n` +
      `📍 <b>Page:</b> ${escapeHtml(cleanPath)}\n` +
      `📅 ${date} | ⏰ ${time}`;

    adminText =
      `🌐 <b>WEBSITE VISIT</b>\n\n` +
      `👤 <b>Visitor:</b> Guest / External Visitor\n` +
      `📱 <b>Telegram:</b> Not linked\n` +
      `📅 ${date} | ⏰ ${time}`;
  }

  const { superAdminRecipients, adminRecipients } = await getSeparatedRecipients(db);

  await Promise.allSettled([
    ...superAdminRecipients.map((chatId) =>
      bot.telegram.sendMessage(chatId, superAdminText, { parse_mode: 'HTML' }).catch(() => {})
    ),
    ...adminRecipients.map((chatId) =>
      bot.telegram.sendMessage(chatId, adminText, { parse_mode: 'HTML' }).catch(() => {})
    )
  ]);
};

/**
 * 2. NEW CHATS NOTIFICATION
 * 💬 NEW CHAT MESSAGE
 * 👤 From: dirshageb@gmail.com
 * 📍 Via: Live Chat (or Telegram)
 * 📅 Nov 19, 2026 | ⏰ 09:19 PM
 * 💭 Message: "Hello!"
 */
const notifyNewChat = async ({ bot, db, sender, content, mediaUrl, mediaType, receiverId, uploadsDir, via = 'Live Chat' }) => {
  if (!bot) return;

  const time = getAddisTime();
  const date = getAddisDate();
  const fromDisplay = sender?.email || sender?.nickname || sender?.full_name || 'Member';
  const viaDisplay = via || (receiverId ? 'Private Message' : 'Live Chat');

  const caption =
    `💬 <b>NEW CHAT MESSAGE</b>\n\n` +
    `👤 <b>From:</b> ${escapeHtml(fromDisplay)}\n` +
    `📍 <b>Via:</b> ${escapeHtml(viaDisplay)}\n` +
    `📅 ${date} | ⏰ ${time}\n` +
    `💭 <b>Message:</b> "${escapeHtml(content || '(Media attachment)')}"`;

  if (mediaUrl) {
    const filename = mediaUrl.split('/').pop();
    const filePath = uploadsDir ? path.join(uploadsDir, filename) : null;

    if (filePath && fs.existsSync(filePath)) {
      if (mediaType === 'image') {
        const fileStream = fs.createReadStream(filePath);
        await sendPhotoToAllAdmins(bot, db, { source: fileStream }, caption);
        return;
      } else {
        const fileStream = fs.createReadStream(filePath);
        let cleanFilename = filename;
        const hyphenIndex = filename.indexOf('-');
        if (hyphenIndex !== -1) cleanFilename = filename.substring(hyphenIndex + 1);
        await sendDocumentToAllAdmins(bot, db, { source: fileStream, filename: cleanFilename }, cleanFilename, caption);
        return;
      }
    } else {
      if (mediaType === 'image') {
        await sendPhotoToAllAdmins(bot, db, { url: mediaUrl }, caption);
        return;
      } else {
        await sendDocumentToAllAdmins(bot, db, { url: mediaUrl }, filename, caption);
        return;
      }
    }
  }

  await sendToAllAdmins(bot, db, caption);
};

/**
 * 3. MESSAGE UPDATE NOTIFICATION RULES
 * Person performing the update       Recipients
 * SUPER_ADMIN + CLERK                SUPER_ADMIN + ADMIN
 * SUPER_ADMIN without CLERK          SUPER_ADMIN only
 * ADMIN + CLERK                      SUPER_ADMIN + ADMIN
 * Ordinary user                      No administrative update
 */
const notifyMessageUpdate = async ({ bot, db, editorUser, newContent, oldContent }) => {
  if (!bot || !editorUser) return;

  let clerkId = null;
  try {
    const clerkSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'clerk_id'").get();
    if (clerkSetting && clerkSetting.value) {
      clerkId = parseInt(clerkSetting.value, 10);
    }
  } catch (e) {}

  const isClerk = (clerkId !== null && editorUser.id === clerkId) || editorUser.role === 'clerk';
  const role = (editorUser.role || '').toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';

  let targetAudience = null; // 'all' | 'super_only' | null
  let roleTitle = '';

  if (isSuperAdmin && isClerk) {
    targetAudience = 'all';
    roleTitle = 'SUPER_ADMIN + CLERK';
  } else if (isSuperAdmin && !isClerk) {
    targetAudience = 'super_only';
    roleTitle = 'SUPER_ADMIN';
  } else if (isAdmin && isClerk) {
    targetAudience = 'all';
    roleTitle = 'ADMIN + CLERK';
  } else if (isAdmin && !isClerk) {
    targetAudience = 'super_only';
    roleTitle = 'ADMIN';
  } else {
    // Ordinary user -> No administrative update
    return;
  }

  const time = getAddisTime();
  const date = getAddisDate();
  const editorDisplay = editorUser.email || editorUser.nickname || editorUser.full_name || 'User';

  const text =
    `✏️ <b>MESSAGE UPDATED</b>\n\n` +
    `👤 <b>Editor:</b> ${escapeHtml(editorDisplay)}\n` +
    `🛡️ <b>Role:</b> <code>${escapeHtml(roleTitle)}</code>\n` +
    `📅 ${date} | ⏰ ${time}\n` +
    `💭 <b>Updated Message:</b> "${escapeHtml(newContent)}"` +
    (oldContent ? `\n📝 <b>Original:</b> "${escapeHtml(oldContent)}"` : '');

  const { superAdminRecipients, adminRecipients } = await getSeparatedRecipients(db);

  if (targetAudience === 'all') {
    const recipients = Array.from(new Set([...superAdminRecipients, ...adminRecipients]));
    await Promise.allSettled(
      recipients.map((chatId) =>
        bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => {})
      )
    );
  } else if (targetAudience === 'super_only') {
    await Promise.allSettled(
      superAdminRecipients.map((chatId) =>
        bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => {})
      )
    );
  }
};

/**
 * 3. NEW MEDIA NOTIFICATION
 */
const notifyNewMedia = async ({ bot, db, uploader, title, caption: mediaCaption, mediaUrl, mediaType, category, uploadsDir }) => {
  if (!bot) return;

  const time = getAddisTime();
  const date = getAddisDate();
  const uploaderName = uploader?.nickname || uploader?.full_name || uploader?.email || 'Platform Admin';
  const categoryLabel = category || 'Gallery';

  const notificationCaption =
    `🖼️ <b>NEW MEDIA POSTED</b>\n\n` +
    `📁 <b>Category:</b> <b>${escapeHtml(categoryLabel)}</b>\n` +
    `👤 <b>Posted by:</b> ${escapeHtml(uploaderName)}\n` +
    `🏷️ <b>Title:</b> <b>${escapeHtml(title || 'Community Photo')}</b>\n` +
    (mediaCaption ? `📝 <b>Caption:</b> "${escapeHtml(mediaCaption)}"\n` : '') +
    `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}`;

  if (mediaUrl) {
    const filename = mediaUrl.split('/').pop();
    const filePath = uploadsDir ? path.join(uploadsDir, filename) : null;

    if (filePath && fs.existsSync(filePath)) {
      if (mediaType === 'image' || (!mediaType && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename))) {
        const fileStream = fs.createReadStream(filePath);
        await sendPhotoToAllAdmins(bot, db, { source: fileStream }, notificationCaption);
        return;
      } else {
        const fileStream = fs.createReadStream(filePath);
        await sendDocumentToAllAdmins(bot, db, { source: fileStream, filename }, filename, notificationCaption);
        return;
      }
    } else {
      if (mediaType === 'image' || (!mediaType && /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl))) {
        await sendPhotoToAllAdmins(bot, db, { url: mediaUrl }, notificationCaption);
        return;
      } else {
        await sendDocumentToAllAdmins(bot, db, { url: mediaUrl }, filename, notificationCaption);
        return;
      }
    }
  }

  await sendToAllAdmins(bot, db, notificationCaption);
};

/**
 * 4. NEW PAYMENTS NOTIFICATION WITH ACCURATE FINANCIAL SUMMARY
 */
const notifyNewPayment = async ({ bot, db, memberName, amount, type, clerkName, notes, memberId }) => {
  if (!bot) return;

  const totals = await calculateFinancialTotals(db);
  const memberMissed = memberId ? await calculateMemberMissed(db, memberId) : 0;
  const time = getAddisTime();
  const date = getAddisDate();

  const formattedAmount = Number(amount || 0).toLocaleString();
  const formattedTotalReceived = Number(totals.totalReceived).toLocaleString();
  const formattedMemberMissed = Number(memberMissed).toLocaleString();
  const formattedTotalMissed = Number(totals.totalOutstandingMissed).toLocaleString();
  const formattedRemainingMoney = Number(totals.remainingMoney).toLocaleString();
  const formattedMoneyAtWork = Number(totals.moneyAtWork).toLocaleString();

  // Determine weekly amount to calculate covered weeks n
  let weeklyAmount = 300;
  try {
    const cfg = await db.prepare('SELECT weekly_amount FROM savings_config ORDER BY effective_date DESC, id DESC LIMIT 1').get();
    if (cfg && cfg.weekly_amount) {
      weeklyAmount = parseFloat(cfg.weekly_amount) || 300;
    }
  } catch (e) {}

  const n = Math.max(1, Math.round(Number(amount || 0) / weeklyAmount));
  const saturdays = getConsecutiveSaturdays(Date.now(), n);

  const message =
    `💰 <b>PAYMENT RECEIVED</b>\n\n` +
    `👤 <b>Member:</b> <b>${escapeHtml(memberName)}</b>\n` +
    `💵 <b>Amount:</b> <b>ETB ${formattedAmount}</b>\n` +
    `📂 <b>Category:</b> Weekly Savings\n` +
    `✍️ <b>Clerk:</b> ${escapeHtml(clerkName || 'Admin')}\n` +
    `📝 <b>Notes:</b> <i>"${escapeHtml(notes || 'Weekly savings payment')}"</i>\n` +
    `📅 ${date} | ⏰ ${time}\n\n` +
    `📊 <b>FINANCIAL SUMMARY (WEEKLY SAVINGS)</b>\n` +
    `• 🟢 <b>Total Money Received:</b> ETB ${formattedTotalReceived}\n` +
    `• 👤 <b>Member's Remaining Missed:</b> ETB ${formattedMemberMissed}\n` +
    `• ⚠️ <b>Total Outstanding Missed:</b> ETB ${formattedTotalMissed}\n` +
    `• 🟡 <b>Available Working Capital for the team:</b> ETB ${formattedRemainingMoney} (Cash & Bank)\n` +
    `• 🔵 <b>Active Investments:</b> ETB ${formattedMoneyAtWork}`;

  const schedKey = `s_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  paymentSchedules.set(schedKey, {
    memberName,
    amount: formattedAmount,
    n,
    saturdays,
    originalText: message,
    schedKey
  });

  if (paymentSchedules.size > 200) {
    const oldestKey = paymentSchedules.keys().next().value;
    paymentSchedules.delete(oldestKey);
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`📅 View ${n}-Week Schedule`, `view_sched_${schedKey}`)]
  ]);

  await sendToAllAdmins(bot, db, message, keyboard);
};

/**
 * 5. MISSED PAYMENTS NOTIFICATION WITH ACCURATE OUTSTANDING TOTALS
 */
const notifyMissedPayment = async ({ bot, db, memberName, amount, clerkName, notes, memberId }) => {
  if (!bot) return;

  const totals = await calculateFinancialTotals(db);
  const memberMissed = memberId ? await calculateMemberMissed(db, memberId) : 0;
  const time = getAddisTime();
  const date = getAddisDate();

  const formattedAmount = Number(amount || 0).toLocaleString();
  const formattedMemberMissed = Number(memberMissed).toLocaleString();
  const formattedTotalMissed = Number(totals.totalOutstandingMissed).toLocaleString();
  const formattedTotalReceived = Number(totals.totalReceived).toLocaleString();
  const formattedRemainingMoney = Number(totals.remainingMoney).toLocaleString();

  const message =
    `⚠️ <b>MISSED PAYMENT RECORDED</b>\n\n` +
    `👤 <b>Member:</b> <b>${escapeHtml(memberName)}</b>\n` +
    `💵 <b>Missed Amount:</b> <b>ETB ${formattedAmount}</b>\n` +
    `📂 <b>Payment Category:</b> <b>Missed / Overdue Savings</b> (<code>saving_missed</code>)\n` +
    `✍️ <b>Recorded by:</b> ${escapeHtml(clerkName || 'Clerk / System')}\n` +
    (notes ? `📝 <b>Notes:</b> <i>"${escapeHtml(notes)}"</i>\n` : '') +
    `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>FINANCIAL SUMMARY (MISSED PAYMENTS)</b>\n` +
    `• ⚠️ <b>Member's Total Missed:</b> ETB ${formattedMemberMissed}\n` +
    `• 🔴 <b>Total Outstanding Money:</b> ETB ${formattedTotalMissed}\n` +
    `• 🟢 <b>Total Money Received to Date:</b> ETB ${formattedTotalReceived}\n` +
    `• 🟡 <b>Available Working Capital:</b> ETB ${formattedRemainingMoney}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Delivered automatically to all platform administrators.</i>`;

  await sendToAllAdmins(bot, db, message);
};

/**
 * 6. FINANCIAL SUMMARIES GROUPED BY PAYMENT CATEGORY
 */
const formatFinancialSummaryText = (totals) => {
  const formattedReceived = Number(totals.totalReceived).toLocaleString();
  const formattedMissed = Number(totals.totalOutstandingMissed).toLocaleString();
  const formattedWorkingCapital = Number(totals.remainingMoney).toLocaleString();
  const formattedMoneyAtWork = Number(totals.moneyAtWork).toLocaleString();
  const formattedProfits = Number(totals.completedProfits).toLocaleString();

  let text =
    `📊 <b>FINANCIAL SUMMARY BY PAYMENT CATEGORY</b>\n\n` +
    `📁 <b>CATEGORY 1: WEEKLY SAVINGS POOL</b>\n` +
    `• 🟢 <b>Received Payments:</b> ETB ${formattedReceived} (${totals.paymentsCount} payments)\n` +
    `• 🔴 <b>Missed / Overdue Payments:</b> ETB ${formattedMissed}\n` +
    `• 👥 <b>Tracked Members:</b> ${totals.membersCount}\n\n` +
    `📁 <b>CATEGORY 2: BUSINESS INVESTMENTS</b>\n` +
    `• 🔵 <b>Capital at Work:</b> ETB ${formattedMoneyAtWork} (Active Projects)\n` +
    `• 📈 <b>Realized Profits:</b> ETB ${formattedProfits} (Completed)\n\n` +
    `📁 <b>CATEGORY 3: CASH & WORKING CAPITAL</b>\n` +
    `• 🟡 <b>Available Working Capital:</b> ETB ${formattedWorkingCapital} (Cash & Bank)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 <b>INDIVIDUAL MEMBER BREAKDOWN:</b>\n`;

  if (totals.memberDebts && totals.memberDebts.length > 0) {
    totals.memberDebts.forEach((m, idx) => {
      const statusIcon = m.debt > 0 ? '⚠️' : '✅';
      text +=
        `<b>${idx + 1}. ${escapeHtml(m.name)}:</b>\n` +
        `   • Paid: ETB ${Number(m.paid).toLocaleString()} | Missed Debt: ETB ${Number(m.debt).toLocaleString()} ${statusIcon}\n`;
    });
  } else {
    text += `<i>No member transactions recorded yet.</i>\n`;
  }

  text += `\n<i>Verified live against database records.</i>`;
  return text;
};

module.exports = {
  getAdminRecipients,
  getSeparatedRecipients,
  calculateFinancialTotals,
  calculateMemberMissed,
  getConsecutiveSaturdays,
  getPaymentSchedule,
  sendToAllAdmins,
  sendPhotoToAllAdmins,
  sendDocumentToAllAdmins,
  notifyWebsiteVisit,
  notifyNewChat,
  notifyMessageUpdate,
  notifyNewMedia,
  notifyNewPayment,
  notifyMissedPayment,
  formatFinancialSummaryText
};
