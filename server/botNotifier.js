const fs = require('fs');
const path = require('path');

// In-memory cache for deduplication and visit debouncing
const recentNotifications = new Map(); // key -> timestamp
const visitCooldowns = new Map(); // ip/userId -> timestamp

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
    second: '2-digit',
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
 * Fetch all registered Admin and Super Admin Telegram Chat IDs.
 * Dynamically queries the database on every call so newly approved admins receive alerts immediately.
 */
const getAdminRecipients = async (db) => {
  const recipients = new Set();

  if (process.env.ADMIN_CHAT_ID && process.env.ADMIN_CHAT_ID !== 'YOUR_CHAT_ID') {
    const rawId = process.env.ADMIN_CHAT_ID.toString().trim();
    if (/^-?\d+$/.test(rawId)) {
      recipients.add(rawId);
    }
  }

  try {
    const adminRows = await db.prepare(`
      SELECT telegram_id FROM bot_access WHERE role IN ('admin', 'super_admin') AND telegram_id IS NOT NULL
      UNION
      SELECT telegram_id FROM users WHERE role IN ('admin', 'super_admin') AND telegram_id IS NOT NULL
    `).all();

    if (Array.isArray(adminRows)) {
      for (const row of adminRows) {
        if (!row || !row.telegram_id) continue;
        const tid = row.telegram_id.toString().trim();
        // Telegram API requires numeric IDs for direct messaging
        if (/^-?\d+$/.test(tid)) {
          recipients.add(tid);
        }
      }
    }
  } catch (err) {
    console.error('⚠️ [botNotifier] Failed to load admin recipients from DB:', err.message);
  }

  return Array.from(recipients);
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

  let text = '';
  if (user) {
    const userName = user.full_name || user.nickname || user.email;
    const userRole = (user.role || 'member').toUpperCase();
    const userTg = user.telegram_username ? `@${user.telegram_username.replace(/^@/, '')}` : 'Not linked';

    text =
      `🌐 <b>WEBSITE VISIT NOTIFICATION</b>\n\n` +
      `👤 <b>User:</b> <b>${escapeHtml(userName)}</b>\n` +
      `🏷️ <b>Username:</b> ${escapeHtml(userTg)}\n` +
      `🛡️ <b>Role:</b> <code>${escapeHtml(userRole)}</code>\n` +
      `📍 <b>Page Viewed:</b> <code>${escapeHtml(cleanPath)}</code>\n` +
      `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}\n\n` +
      `<i>Real-time activity recorded on Friends Platform.</i>`;
  } else {
    text =
      `🌐 <b>WEBSITE VISIT NOTIFICATION</b>\n\n` +
      `👤 <b>Visitor:</b> <b>Guest / External Visitor</b>\n` +
      `📍 <b>Page Viewed:</b> <code>${escapeHtml(cleanPath)}</code>\n` +
      `🌐 <b>IP Address:</b> <code>${escapeHtml(ip || 'Hidden / Proxy')}</code>\n` +
      `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}\n\n` +
      `<i>Someone is visiting the Friends Platform.</i>`;
  }

  await sendToAllAdmins(bot, db, text);
};

/**
 * 2. NEW CHATS NOTIFICATION
 */
const notifyNewChat = async ({ bot, db, sender, content, mediaUrl, mediaType, receiverId, uploadsDir }) => {
  if (!bot) return;

  const time = getAddisTime();
  const date = getAddisDate();
  const senderName = sender.nickname || sender.full_name || sender.email || 'Member';
  const senderTg = sender.telegram_username ? `@${sender.telegram_username.replace(/^@/, '')}` : '';
  const channel = receiverId ? `Private Message (User #${receiverId})` : `Community Live Chat`;

  const caption =
    `💬 <b>NEW CHAT MESSAGE</b>\n\n` +
    `👤 <b>From:</b> <b>${escapeHtml(senderName)}</b> ${senderTg ? `(<code>${escapeHtml(senderTg)}</code>)` : ''}\n` +
    `📍 <b>Channel:</b> ${escapeHtml(channel)}\n` +
    `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}\n\n` +
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

  const message =
    `💰 <b>NEW PAYMENT RECEIVED</b>\n\n` +
    `👤 <b>Member:</b> <b>${escapeHtml(memberName)}</b>\n` +
    `💵 <b>Amount Paid:</b> <b>ETB ${formattedAmount}</b>\n` +
    `📂 <b>Payment Category:</b> <b>Weekly Savings</b> (<code>saving_payment</code>)\n` +
    `✍️ <b>Signed by Clerk:</b> ${escapeHtml(clerkName || 'Admin')}\n` +
    (notes ? `📝 <b>Notes:</b> <i>"${escapeHtml(notes)}"</i>\n` : '') +
    `📅 <b>Date:</b> ${date} | ⏰ <b>Time:</b> ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>FINANCIAL SUMMARY (WEEKLY SAVINGS)</b>\n` +
    `• 🟢 <b>Total Money Received:</b> ETB ${formattedTotalReceived}\n` +
    `• 👤 <b>Member's Remaining Missed:</b> ETB ${formattedMemberMissed}\n` +
    `• ⚠️ <b>Total Outstanding Missed:</b> ETB ${formattedTotalMissed}\n` +
    `• 🟡 <b>Available Working Capital:</b> ETB ${formattedRemainingMoney} (Cash & Bank)\n` +
    `• 🔵 <b>Active Investments:</b> ETB ${formattedMoneyAtWork}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Delivered automatically to all platform administrators.</i>`;

  await sendToAllAdmins(bot, db, message);
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
  calculateFinancialTotals,
  calculateMemberMissed,
  sendToAllAdmins,
  sendPhotoToAllAdmins,
  sendDocumentToAllAdmins,
  notifyWebsiteVisit,
  notifyNewChat,
  notifyNewMedia,
  notifyNewPayment,
  notifyMissedPayment,
  formatFinancialSummaryText
};
