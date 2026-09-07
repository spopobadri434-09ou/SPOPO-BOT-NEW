import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from "@whiskeysockets/baileys";

import P from "pino";
import fs from "fs";
import http from "http";

// =====================================================
// CONFIG
// =====================================================

const BOT_NUMBER = "212644140800";
const OWNER_NUMBER = "212644140800";

const PREFIX = ".";
const SESSION_DIR = "./session";
const DATA_DIR = "./data";
const PORT = process.env.PORT || 3000;

const logger = P({ level: "silent" });

// =====================================================
// FOLDERS
// =====================================================

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =====================================================
// DATABASE
// =====================================================

const usersFile = `${DATA_DIR}/users.json`;

let users = {};

try {
  if (fs.existsSync(usersFile)) {
    users = JSON.parse(
      fs.readFileSync(usersFile, "utf8")
    );
  }
} catch {
  users = {};
}

function saveUsers() {
  fs.writeFileSync(
    usersFile,
    JSON.stringify(users, null, 2)
  );
}

// =====================================================
// RANKS
// =====================================================

const RANKS = {
  citizen: {
    name: "مواطن",
    level: 1
  },

  vip: {
    name: "مميز",
    level: 2
  },

  moderator: {
    name: "مشرف",
    level: 3
  },

  deputy: {
    name: "نائب",
    level: 4
  },

  president: {
    name: "رئيس",
    level: 5
  },

  owner: {
    name: "ملاك",
    level: 6
  }
};

function getUser(jid) {
  const number = jid.split("@")[0];

  if (!users[number]) {
    users[number] = {
      coins: 100,
      rank:
        number === OWNER_NUMBER
          ? "owner"
          : "citizen",
      inventory: {},
      lastDaily: 0
    };

    saveUsers();
  }

  return users[number];
}

function rankLevel(rank) {
  return RANKS[rank]?.level || 1;
}

function rankName(rank) {
  return RANKS[rank]?.name || "مواطن";
}

function hasRank(jid, rank) {
  const number = jid.split("@")[0];

  if (number === OWNER_NUMBER) {
    return true;
  }

  return (
    rankLevel(getUser(jid).rank) >=
    rankLevel(rank)
  );
}

// =====================================================
// SHOP
// =====================================================

const SHOP = {
  vip: {
    name: "⭐ مميز",
    price: 500,
    rank: "vip"
  },

  gift: {
    name: "🎁 هدية",
    price: 150
  },

  armor: {
    name: "🛡️ درع",
    price: 250
  },

  diamond: {
    name: "💎 ألماسة",
    price: 1000
  }
};

// =====================================================
// HELPERS
// =====================================================

function isGroup(jid) {
  return jid?.endsWith("@g.us");
}

function getText(message) {
  const m = message.message;

  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  ).trim();
}

function getSender(message) {
  return (
    message.key.participant ||
    message.key.remoteJid ||
    ""
  );
}

function getMentions(message) {
  return (
    message.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || []
  );
}

function getTarget(message, args) {
  const mentions = getMentions(message);

  if (mentions.length > 0) {
    return mentions[0];
  }

  const quoted =
    message.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.participant;

  if (quoted) {
    return quoted;
  }

  const number = args[0]?.replace(/\D/g, "");

  if (number) {
    return `${number}@s.whatsapp.net`;
  }

  return null;
}

async function reply(sock, jid, text, message) {
  return sock.sendMessage(
    jid,
    { text },
    { quoted: message }
  );
}

async function isAdmin(sock, group, jid) {
  try {
    const metadata =
      await sock.groupMetadata(group);

    const member =
      metadata.participants.find(
        p => p.id === jid
      );

    return (
      member?.admin === "admin" ||
      member?.admin === "superadmin"
    );
  } catch {
    return false;
  }
}

async function botAdmin(sock, group) {
  if (!sock.user?.id) return false;

  return isAdmin(
    sock,
    group,
    sock.user.id
  );
}

// =====================================================
// COMMAND HANDLER
// =====================================================

async function handleCommand(sock, message) {
  const jid = message.key.remoteJid;

  if (!jid) return;

  const text = getText(message);

  if (!text.startsWith(PREFIX)) {
    return;
  }

  const sender = getSender(message);

  const content =
    text.slice(PREFIX.length).trim();

  const parts = content.split(/\s+/);

  const command =
    parts.shift()?.toLowerCase();

  const args = parts;

  if (!command) return;

  const user = getUser(sender);

  // ===================================================
  // MENU
  // ===================================================

  if (
    command === "menu" ||
    command === "help" ||
    command === "اوامر"
  ) {
    return reply(
      sock,
      jid,
      `╭━━━〔 🤖 SPOPO BOT 〕━━━╮
┃
┃ 🔐 Pairing Code
┃ 📱 212644140800
┃
┃ 👑 الرتب
┃ .رتب
┃ .ترقية @user
┃ .تنزيل @user
┃
┃ 💰 الاقتصاد
┃ .حسابي
┃ .يومية
┃ .متجر
┃ .شراء vip
┃ .مخزوني
┃ .تحويل @user 100
┃ .متصدرين
┃
┃ 👥 المجموعة
┃ .معلومات
┃ .منشن
┃ .طرد @user
┃ .اضف 2126xxxxxxx
┃ .ترقية_ادمن @user
┃ .تنزيل_ادمن @user
┃ .اسم الاسم
┃ .وصف الوصف
┃ .رابط
┃ .سحب_الرابط
┃ .قفل
┃ .فتح
┃
┃ 🛠️ عام
┃ .بينغ
┃ .بوت
┃ .ايدي
┃
╰━━━━━━━━━━━━━━━━━━╯`,
      message
    );
  }

  // ===================================================
  // PING
  // ===================================================

  if (
    command === "ping" ||
    command === "بينغ"
  ) {
    return reply(
      sock,
      jid,
      "🏓 Pong!\n✅ SPOPO BOT خدام.",
      message
    );
  }

  // ===================================================
  // BOT
  // ===================================================

  if (command === "bot") {
    return reply(
      sock,
      jid,
      `🤖 SPOPO BOT

🟢 الحالة: Online
🔐 النظام: Pairing Code
📱 الرقم: 212644140800
⚡ Prefix: .
👑 الرتب: 6
🛒 المتجر: مفعل`,
      message
    );
  }

  // ===================================================
  // ID
  // ===================================================

  if (
    command === "id" ||
    command === "ايدي"
  ) {
    return reply(
      sock,
      jid,
      `🆔 ID ديالك:

${sender}`,
      message
    );
  }

  // ===================================================
  // ACCOUNT
  // ===================================================

  if (
    command === "حسابي" ||
    command === "me"
  ) {
    return reply(
      sock,
      jid,
      `👤 حسابك

👑 الرتبة:
${rankName(user.rank)}

💰 العملات:
${user.coins} 🪙

🎒 العناصر:
${Object.values(user.inventory)
        .reduce((a, b) => a + b, 0)}`,
      message
    );
  }

  // ===================================================
  // DAILY
  // ===================================================

  if (
    command === "daily" ||
    command === "يومية"
  ) {
    const now = Date.now();

    if (
      now - user.lastDaily <
      86400000
    ) {
      return reply(
        sock,
        jid,
        "⏳ استعمل اليومية مرة أخرى غداً.",
        message
      );
    }

    const reward =
      Math.floor(Math.random() * 201) + 200;

    user.coins += reward;
    user.lastDaily = now;

    saveUsers();

    return reply(
      sock,
      jid,
      `🎁 اليومية

ربحتي:
+${reward} 🪙

💰 الرصيد:
${user.coins} 🪙`,
      message
    );
  }

  // ===================================================
  // SHOP
  // ===================================================

  if (
    command === "shop" ||
    command === "متجر"
  ) {
    return reply(
      sock,
      jid,
      `🛒 متجر SPOPO

⭐ vip
💰 500 🪙

🎁 gift
💰 150 🪙

🛡️ armor
💰 250 🪙

💎 diamond
💰 1000 🪙

للشراء:
.شراء vip`,
      message
    );
  }

  // ===================================================
  // BUY
  // ===================================================

  if (
    command === "buy" ||
    command === "شراء"
  ) {
    const item =
      args[0]?.toLowerCase();

    if (!item || !SHOP[item]) {
      return reply(
        sock,
        jid,
        "❌ المنتج غير موجود.\nاستعمل .متجر",
        message
      );
    }

    const product = SHOP[item];

    if (user.coins < product.price) {
      return reply(
        sock,
        jid,
        `❌ رصيدك غير كافي.

💰 عندك: ${user.coins}
💵 الثمن: ${product.price}`,
        message
      );
    }

    if (
      product.rank &&
      rankLevel(user.rank) >=
        rankLevel(product.rank)
    ) {
      return reply(
        sock,
        jid,
        "❌ عندك هاد الرتبة أو أعلى.",
        message
      );
    }

    user.coins -= product.price;

    if (product.rank) {
      user.rank = product.rank;
    } else {
      user.inventory[item] =
        (user.inventory[item] || 0) + 1;
    }

    saveUsers();

    return reply(
      sock,
      jid,
      `✅ تمت عملية الشراء!

🛍️ ${product.name}
💰 الثمن: ${product.price} 🪙
💵 الباقي: ${user.coins} 🪙`,
      message
    );
  }

  // ===================================================
  // INVENTORY
  // ===================================================

  if (
    command === "مخزوني" ||
    command === "inventory"
  ) {
    const items =
      Object.entries(user.inventory);

    if (!items.length) {
      return reply(
        sock,
        jid,
        "🎒 المخزون فارغ.",
        message
      );
    }

    let result =
      "🎒 مخزونك:\n\n";

    for (
      const [id, amount] of items
    ) {
      result +=
        `• ${id}: ${amount}\n`;
    }

    return reply(
      sock,
      jid,
      result,
      message
    );
  }

  // ===================================================
  // TRANSFER
  // ===================================================

  if (
    command === "تحويل" ||
    command === "pay"
  ) {
    const target =
      getTarget(message, args);

    const amount = Number(
      args.find(x =>
        /^\d+$/.test(x)
      )
    );

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return reply(
        sock,
        jid,
        "❌ المبلغ غير صحيح.",
        message
      );
    }

    if (user.coins < amount) {
      return reply(
        sock,
        jid,
        "❌ ما عندكش رصيد كافي.",
        message
      );
    }

    const receiver =
      getUser(target);

    user.coins -= amount;
    receiver.coins += amount;

    saveUsers();

    return reply(
      sock,
      jid,
      `✅ التحويل ناجح!

💸 المبلغ:
${amount} 🪙

👤 إلى:
@${target.split("@")[0]}

💰 رصيدك:
${user.coins} 🪙`,
      message
    );
  }

  // ===================================================
  // LEADERBOARD
  // ===================================================

  if (
    command === "متصدرين" ||
    command === "top"
  ) {
    const list =
      Object.entries(users)
        .sort(
          (a, b) =>
            b[1].coins - a[1].coins
        )
        .slice(0, 10);

    let result =
      "🏆 المتصدرين\n\n";

    list.forEach(
      ([number, data], i) => {
        result +=
          `${i + 1}. @${number}\n` +
          `💰 ${data.coins} 🪙\n` +
          `👑 ${rankName(data.rank)}\n\n`;
      }
    );

    return reply(
      sock,
      jid,
      result,
      message
    );
  }

  // ===================================================
  // RANKS
  // ===================================================

  if (
    command === "رتب" ||
    command === "ranks"
  ) {
    return reply(
      sock,
      jid,
      `👑 رتب SPOPO

6️⃣ ملاك
5️⃣ رئيس
4️⃣ نائب
3️⃣ مشرف
2️⃣ مميز
1️⃣ مواطن`,
      message
    );
  }

  // ===================================================
  // PROMOTE BOT RANK
  // ===================================================

  if (
    command === "ترقية"
  ) {
    if (
      !hasRank(
        sender,
        "president"
      )
    ) {
      return reply(
        sock,
        jid,
        "❌ خاصك رتبة رئيس أو أعلى.",
        message
      );
    }

    const target =
      getTarget(message, args);

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    const targetUser =
      getUser(target);

    if (
      rankLevel(targetUser.rank) >=
      rankLevel("president")
    ) {
      return reply(
        sock,
        jid,
        "❌ ما يمكنش تغير رتبة رئيس أو ملاك.",
        message
      );
    }

    targetUser.rank =
      "moderator";

    saveUsers();

    return reply(
      sock,
      jid,
      `✅ تمت الترقية.

👤 @${target.split("@")[0]}
👑 الرتبة: مشرف`,
      message
    );
  }

  // ===================================================
  // DEMOTE
  // ===================================================

  if (
    command === "تنزيل"
  ) {
    if (
      !hasRank(
        sender,
        "president"
      )
    ) {
      return reply(
        sock,
        jid,
        "❌ خاصك رتبة رئيس أو أعلى.",
        message
      );
    }

    const target =
      getTarget(message, args);

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    const targetUser =
      getUser(target);

    if (
      rankLevel(targetUser.rank) >=
      rankLevel("president")
    ) {
      return reply(
        sock,
        jid,
        "❌ ما يمكنش تنزل رئيس أو ملاك.",
        message
      );
    }

    targetUser.rank =
      "citizen";

    saveUsers();

    return reply(
      sock,
      jid,
      `✅ تمت إزالة الرتبة.

👤 @${target.split("@")[0]}
👑 الرتبة: مواطن`,
      message
    );
  }

  // ===================================================
  // GROUP COMMANDS
  // ===================================================

  if (!isGroup(jid)) {
    return;
  }

  const senderAdmin =
    await isAdmin(
      sock,
      jid,
      sender
    );

  const isBotAdmin =
    await botAdmin(
      sock,
      jid
    );

  // ===================================================
  // GROUP INFO
  // ===================================================

  if (
    command === "معلومات"
  ) {
    const metadata =
      await sock.groupMetadata(jid);

    const admins =
      metadata.participants.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      ).length;

    return reply(
      sock,
      jid,
      `👥 معلومات المجموعة

📛 ${metadata.subject}

👤 الأعضاء:
${metadata.participants.length}

👑 المشرفين:
${admins}`,
      message
    );
  }

  // ===================================================
  // TAG ALL
  // ===================================================

  if (
    command === "منشن" ||
    command === "tagall"
  ) {
    if (
      !senderAdmin &&
      !hasRank(
        sender,
        "moderator"
      )
    ) {
      return reply(
        sock,
        jid,
        "❌ الأمر للمشرفين فقط.",
        message
      );
    }

    const metadata =
      await sock.groupMetadata(jid);

    const participants =
      metadata.participants;

    const mentions =
      participants.map(
        p => p.id
      );

    let text =
      args.length
        ? args.join(" ")
        : "📢 انتباه الجميع!";

    text += "\n\n";

    for (const p of participants) {
      text +=
        `@${p.id.split("@")[0]} `;
    }

    return sock.sendMessage(
      jid,
      {
        text,
        mentions
      },
      { quoted: message }
    );
  }

  // ===================================================
  // KICK
  // ===================================================

  if (
    command === "طرد" ||
    command === "kick"
  ) {
    if (!senderAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin.",
        message
      );
    }

    if (!isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ البوت خاصو يكون Admin.",
        message
      );
    }

    const target =
      getTarget(message, args);

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "remove"
    );

    return reply(
      sock,
      jid,
      `✅ تم طرد @${target.split("@")[0]}.`,
      message
    );
  }

  // ===================================================
  // ADD
  // ===================================================

  if (
    command === "اضف" ||
    command === "add"
  ) {
    if (!senderAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin.",
        message
      );
    }

    if (!isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ البوت خاصو يكون Admin.",
        message
      );
    }

    const number =
      args[0]?.replace(/\D/g, "");

    if (!number) {
      return reply(
        sock,
        jid,
        "❌ مثال:\n.اضف 212644140800",
        message
      );
    }

    await sock.groupParticipantsUpdate(
      jid,
      [`${number}@s.whatsapp.net`],
      "add"
    );

    return reply(
      sock,
      jid,
      `✅ تمت محاولة إضافة @${number}.`,
      message
    );
  }

  // ===================================================
  // PROMOTE ADMIN
  // ===================================================

  if (
    command === "ترقية_ادمن"
  ) {
    if (!senderAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin.",
        message
      );
    }

    if (!isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ البوت خاصو يكون Admin.",
        message
      );
    }

    const target =
      getTarget(message, args);

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "promote"
    );

    return reply(
      sock,
      jid,
      `👑 تمت ترقية @${target.split("@")[0]} إلى Admin.`,
      message
    );
  }

  // ===================================================
  // DEMOTE ADMIN
  // ===================================================

  if (
    command === "تنزيل_ادمن"
  ) {
    if (!senderAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin.",
        message
      );
    }

    if (!isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ البوت خاصو يكون Admin.",
        message
      );
    }

    const target =
      getTarget(message, args);

    if (!target) {
      return reply(
        sock,
        jid,
        "❌ منشن الشخص.",
        message
      );
    }

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "demote"
    );

    return reply(
      sock,
      jid,
      `⬇️ تمت إزالة Admin من @${target.split("@")[0]}.`,
      message
    );
  }

  // ===================================================
  // GROUP NAME
  // ===================================================

  if (
    command === "اسم"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    const name =
      args.join(" ").trim();

    if (!name) {
      return reply(
        sock,
        jid,
        "❌ كتب الاسم الجديد.",
        message
      );
    }

    await sock.groupUpdateSubject(
      jid,
      name
    );

    return reply(
      sock,
      jid,
      "✅ تبدل اسم المجموعة.",
      message
    );
  }

  // ===================================================
  // DESCRIPTION
  // ===================================================

  if (
    command === "وصف"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    const description =
      args.join(" ").trim();

    if (!description) {
      return reply(
        sock,
        jid,
        "❌ كتب الوصف الجديد.",
        message
      );
    }

    await sock.groupUpdateDescription(
      jid,
      description
    );

    return reply(
      sock,
      jid,
      "✅ تبدل وصف المجموعة.",
      message
    );
  }

  // ===================================================
  // LINK
  // ===================================================

  if (
    command === "رابط"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    const code =
      await sock.groupInviteCode(jid);

    return reply(
      sock,
      jid,
      `🔗 رابط المجموعة:

https://chat.whatsapp.com/${code}`,
      message
    );
  }

  // ===================================================
  // REVOKE LINK
  // ===================================================

  if (
    command === "سحب_الرابط"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    await sock.groupRevokeInvite(jid);

    return reply(
      sock,
      jid,
      "✅ تم تغيير رابط المجموعة.",
      message
    );
  }

  // ===================================================
  // LOCK
  // ===================================================

  if (
    command === "قفل"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    await sock.groupSettingUpdate(
      jid,
      "announcement"
    );

    return reply(
      sock,
      jid,
      "🔒 تم قفل المجموعة.",
      message
    );
  }

  // ===================================================
  // UNLOCK
  // ===================================================

  if (
    command === "فتح"
  ) {
    if (!senderAdmin || !isBotAdmin) {
      return reply(
        sock,
        jid,
        "❌ خاصك تكون Admin والبوت حتى هو.",
        message
      );
    }

    await sock.groupSettingUpdate(
      jid,
      "not_announcement"
    );

    return reply(
      sock,
      jid,
      "🔓 تم فتح المجموعة.",
      message
    );
  }
}

// =====================================================
// START BOT
// =====================================================

async function startBot() {
  try {
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );

    let version;

    try {
      const result =
        await fetchLatestBaileysVersion();

      version = result.version;
    } catch {
      version = undefined;
    }

    const sock = makeWASocket({
      auth: state,

      ...(version ? { version } : {}),

      logger,

      printQRInTerminal: false,

      browser:
        Browsers.macOS("Desktop"),

      markOnlineOnConnect: false,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 60000,

      keepAliveIntervalMs: 25000
    });

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // =================================================
    // PAIRING CODE
    // =================================================

    if (!state.creds.registered) {
      console.log("");
      console.log(
        "===================================="
      );
      console.log(
        "🔐 SPOPO BOT PAIRING CODE"
      );
      console.log(
        "📱 NUMBER: 212644140800"
      );
      console.log(
        "===================================="
      );

      try {
        const code =
          await sock.requestPairingCode(
            BOT_NUMBER
          );

        console.log("");
        console.log(
          "🔑 PAIRING CODE:"
        );
        console.log(code);
        console.log("");
        console.log(
          "WhatsApp > الأجهزة المرتبطة"
        );
        console.log(
          "ربط جهاز > الربط برقم الهاتف"
        );
        console.log(
          "دخل الكود اللي فوق"
        );
        console.log("");
      } catch (error) {
        console.error(
          "❌ Pairing Code Error:",
          error?.message || error
        );
      }
    }

    // =================================================
    // CONNECTION
    // =================================================

    sock.ev.on(
      "connection.update",
      ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log("");
          console.log(
            "===================================="
          );
          console.log(
            "✅ SPOPO BOT CONNECTED"
          );
          console.log(
            "📱 212644140800"
          );
          console.log(
            "🤖 BOT ONLINE"
          );
          console.log(
            "===================================="
          );
        }

        if (connection === "close") {
          const status =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          if (
            status ===
            DisconnectReason.loggedOut
          ) {
            console.log(
              "❌ Session logged out."
            );
            return;
          }

          console.log(
            "🔄 إعادة الاتصال بعد 5 ثواني..."
          );

          setTimeout(
            startBot,
            5000
          );
        }
      }
    );

    // =================================================
    // MESSAGES
    // =================================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {
        for (const message of messages) {
          try {
            if (!message.message) {
              continue;
            }

            if (
              message.key.remoteJid ===
              "status@broadcast"
            ) {
              continue;
            }

            await handleCommand(
              sock,
              message
            );
          } catch (error) {
            console.error(
              "Command Error:",
              error?.message || error
            );
          }
        }
      }
    );

  } catch (error) {
    console.error(
      "❌ BOT ERROR:",
      error?.message || error
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

// =====================================================
// RAILWAY SERVER
// =====================================================

const server =
  http.createServer(
    (req, res) => {
      res.writeHead(
        200,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );

      res.end(
        "SPOPO BOT ONLINE ✅"
      );
    }
  );

server.listen(
  PORT,
  () => {
    console.log(
      `🌐 Server running on port ${PORT}`
    );
  }
);

// =====================================================
// RUN
// =====================================================

console.log("");
console.log(
  "🤖 SPOPO BOT STARTING..."
);
console.log(
  "📱 NUMBER: 212644140800"
);
console.log(
  "🔐 QR DISABLED"
);
console.log(
  "🔑 PAIRING CODE ENABLED"
);
console.log("");

startBot();
