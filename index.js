import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  delay
} from "@whiskeysockets/baileys";

import P from "pino";
import fs from "fs";
import path from "path";
import http from "http";

// =================================================
// SPOPO BOT
// QR CODE VERSION
// =================================================

const BOT_NUMBER = "212644140800";
const OWNER_NUMBER = "212644140800";

const PREFIX = ".";

const SESSION_DIR = "./session";
const DATA_DIR = "./data";
const USERS_FILE = path.join(DATA_DIR, "users.json");

const PORT = process.env.PORT || 3000;

// =================================================
// FOLDERS
// =================================================

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "{}", "utf8");
}

// =================================================
// RAILWAY SERVER
// =================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("SPOPO BOT ONLINE");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Railway server running on port ${PORT}`);
});

// =================================================
// DATABASE
// =================================================

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, "{}", "utf8");
    }

    const data = fs.readFileSync(
      USERS_FILE,
      "utf8"
    );

    if (!data.trim()) {
      return {};
    }

    return JSON.parse(data);

  } catch (error) {
    console.log("⚠️ Database read error");
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(users, null, 2),
      "utf8"
    );
  } catch (error) {
    console.log(
      "❌ Database save error:",
      error.message
    );
  }
}

// =================================================
// USER SYSTEM
// =================================================

function createUser() {
  return {
    coins: 100,
    xp: 0,
    level: 1,

    rank: "citizen",

    inventory: {
      vip: 0,
      gift: 0,
      armor: 0,
      diamond: 0
    }
  };
}

function ensureUser(jid) {
  const users = loadUsers();

  if (!users[jid]) {
    users[jid] = createUser();
    saveUsers(users);
  }

  return users[jid];
}

function getUser(jid) {
  return ensureUser(jid);
}

function updateUser(jid, user) {
  const users = loadUsers();

  users[jid] = user;

  saveUsers(users);
}

// =================================================
// RANKS
// =================================================

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

function rankName(rank) {
  return RANKS[rank]?.name || "مواطن";
}

function rankLevel(rank) {
  return RANKS[rank]?.level || 1;
}

// =================================================
// NUMBER
// =================================================

function normalizeNumber(jid = "") {
  return jid
    .split(":")[0]
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "");
}

function isOwner(jid) {
  const number = normalizeNumber(jid);

  return (
    number === BOT_NUMBER ||
    number === OWNER_NUMBER
  );
}

function hasRank(jid, level) {
  if (isOwner(jid)) {
    return true;
  }

  const user = getUser(jid);

  return rankLevel(user.rank) >= level;
}

// =================================================
// GROUP ADMIN
// =================================================

function isAdmin(jid, metadata) {
  if (isOwner(jid)) {
    return true;
  }

  const participant =
    metadata.participants.find(
      p =>
        normalizeNumber(p.id) ===
        normalizeNumber(jid)
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

// =================================================
// MESSAGE TEXT
// =================================================

function getText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

// =================================================
// MENTIONS
// =================================================

function getMentions(message) {
  return (
    message?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || []
  );
}

function getQuotedUser(message) {
  return (
    message?.extendedTextMessage
      ?.contextInfo
      ?.participant || null
  );
}

// =================================================
// REPLY
// =================================================

async function reply(
  sock,
  jid,
  text,
  message
) {
  try {
    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: message
      }
    );
  } catch (error) {
    console.log(
      "❌ Send error:",
      error.message
    );
  }
}

// =================================================
// SHOP
// =================================================

const SHOP = {
  vip: {
    name: "⭐ مميز",
    price: 1000
  },

  gift: {
    name: "🎁 هدية",
    price: 250
  },

  armor: {
    name: "🛡️ درع",
    price: 500
  },

  diamond: {
    name: "💎 ألماسة",
    price: 2500
  }
};

// =================================================
// DAILY
// =================================================

const daily = new Map();

// =================================================
// BOT
// =================================================

let reconnectTimer = null;
let starting = false;

async function startBot() {

  if (starting) {
    return;
  }

  starting = true;

  try {

    console.log("");
    console.log("================================");
    console.log("🤖 SPOPO BOT");
    console.log("================================");
    console.log(`📱 NUMBER: ${BOT_NUMBER}`);
    console.log("📷 QR CODE: ON");
    console.log("🔐 PAIRING CODE: OFF");
    console.log("================================");
    console.log("");

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );

    const sock = makeWASocket({

      auth: state,

      logger: P({
        level: "silent"
      }),

      browser: Browsers.macOS(
        "Desktop"
      ),

      // ========================================
      // QR CODE
      // ========================================

      printQRInTerminal: true,

      generateHighQualityLinkPreview:
        false,

      markOnlineOnConnect:
        false,

      syncFullHistory:
        false
    });

    // ========================================
    // SAVE SESSION
    // ========================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ========================================
    // CONNECTION
    // ========================================

    sock.ev.on(
      "connection.update",
      async update => {

        const {
          connection,
          lastDisconnect
        } = update;

        // ======================================
        // CONNECTING
        // ======================================

        if (
          connection === "connecting"
        ) {

          console.log(
            "⏳ Connecting to WhatsApp..."
          );
        }

        // ======================================
        // OPEN
        // ======================================

        if (
          connection === "open"
        ) {

          starting = false;

          console.log("");
          console.log(
            "================================"
          );
          console.log(
            "✅ SPOPO BOT CONNECTED"
          );
          console.log(
            "🤖 BOT ONLINE"
          );
          console.log(
            `📱 ${BOT_NUMBER}`
          );
          console.log(
            "📷 QR CODE: ACTIVE"
          );
          console.log(
            "================================"
          );
          console.log("");
        }

        // ======================================
        // CLOSE
        // ======================================

        if (
          connection === "close"
        ) {

          starting = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log("");
          console.log(
            "================================"
          );
          console.log(
            "⚠️ WHATSAPP CONNECTION CLOSED"
          );
          console.log(
            `📌 STATUS: ${
              statusCode || "unknown"
            }`
          );
          console.log(
            "================================"
          );
          console.log("");

          // LOGGED OUT
          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "❌ WhatsApp session logged out."
            );

            console.log(
              "⚠️ Login again with QR."
            );

            return;
          }

          // RECONNECT
          if (!reconnectTimer) {

            console.log(
              "🔄 Reconnecting in 7 seconds..."
            );

            reconnectTimer =
              setTimeout(
                async () => {

                  reconnectTimer = null;

                  try {
                    await startBot();
                  } catch (error) {

                    console.log(
                      "❌ Reconnect error:",
                      error.message
                    );
                  }

                },
                7000
              );
          }
        }
      }
    );

    // ========================================
    // MESSAGES
    // ========================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        try {

          const message =
            messages?.[0];

          if (!message) {
            return;
          }

          if (
            message.key?.fromMe
          ) {
            return;
          }

          const jid =
            message.key.remoteJid;

          if (!jid) {
            return;
          }

          const text =
            getText(message);

          if (
            !text.startsWith(
              PREFIX
            )
          ) {
            return;
          }

          const parts =
            text
              .slice(PREFIX.length)
              .trim()
              .split(/\s+/);

          const command =
            (
              parts.shift() || ""
            ).toLowerCase();

          const args = parts;

          const sender =
            message.key.participant ||
            jid;

          // Create user
          getUser(sender);

          // ====================================
          // PING
          // ====================================

          if (
            command === "بينغ" ||
            command === "ping"
          ) {

            await reply(
              sock,
              jid,
              "🏓 Pong!\n🤖 SPOPO BOT خدام.",
              message
            );

            return;
          }

          // ====================================
          // BOT
          // ====================================

          if (
            command === "بوت" ||
            command === "bot"
          ) {

            await reply(
              sock,
              jid,
              `🤖 SPOPO BOT

✅ Online
⚡ Railway
📷 QR Code: ON
🔐 Pairing Code: OFF`,
              message
            );

            return;
          }

          // ====================================
          // ID
          // ====================================

          if (
            command === "ايدي" ||
            command === "id"
          ) {

            await reply(
              sock,
              jid,
              `🆔 ID ديالك:

${sender}`,
              message
            );

            return;
          }

          // ====================================
          // ACCOUNT
          // ====================================

          if (
            command === "حسابي" ||
            command === "profile"
          ) {

            const user =
              getUser(sender);

            await reply(
              sock,
              jid,
              `👤 حسابك

💰 العملات: ${user.coins}
⭐ XP: ${user.xp}
📈 المستوى: ${user.level}
👑 الرتبة: ${rankName(
                user.rank
              )}

🎒 المخزون:

⭐ VIP: ${user.inventory.vip}
🎁 Gift: ${user.inventory.gift}
🛡️ Armor: ${user.inventory.armor}
💎 Diamond: ${user.inventory.diamond}`,
              message
            );

            return;
          }

          // ====================================
          // DAILY
          // ====================================

          if (
            command === "يومية" ||
            command === "daily"
          ) {

            const now =
              Date.now();

            const last =
              daily.get(sender) || 0;

            const cooldown =
              24 *
              60 *
              60 *
              1000;

            if (
              now - last <
              cooldown
            ) {

              const remaining =
                cooldown -
                (now - last);

              const hours =
                Math.ceil(
                  remaining /
                  (60 * 60 * 1000)
                );

              await reply(
                sock,
                jid,
                `⏳ مازال خاصك تصبر.

باقي تقريباً:
${hours} ساعة`,
                message
              );

              return;
            }

            const reward =
              500 +
              Math.floor(
                Math.random() * 500
              );

            const user =
              getUser(sender);

            user.coins += reward;
            user.xp += 20;

            if (
              user.xp >=
              user.level * 100
            ) {

              user.xp = 0;
              user.level++;
            }

            updateUser(
              sender,
              user
            );

            daily.set(
              sender,
              now
            );

            await reply(
              sock,
              jid,
              `🎁 اليومية وصلات!

💰 +${reward} عملة
⭐ +20 XP

💰 الرصيد:
${user.coins}`,
              message
            );

            return;
          }

          // ====================================
          // SHOP
          // ====================================

          if (
            command === "متجر" ||
            command === "shop"
          ) {

            await reply(
              sock,
              jid,
              `🛒 متجر SPOPO

⭐ vip = ${SHOP.vip.price}
🎁 gift = ${SHOP.gift.price}
🛡️ armor = ${SHOP.armor.price}
💎 diamond = ${SHOP.diamond.price}

مثال:

.شراء vip
.شراء gift
.شراء armor
.شراء diamond`,
              message
            );

            return;
          }

          // ====================================
          // BUY
          // ====================================

          if (
            command === "شراء" ||
            command === "buy"
          ) {

            const item =
              (
                args[0] || ""
              ).toLowerCase();

            if (!SHOP[item]) {

              await reply(
                sock,
                jid,
                "❌ السلعة غير موجودة.\nاستعمل .متجر",
                message
              );

              return;
            }

            const user =
              getUser(sender);

            if (
              user.coins <
              SHOP[item].price
            ) {

              await reply(
                sock,
                jid,
                `❌ العملات ما كافياش.

💰 عندك:
${user.coins}

💵 الثمن:
${SHOP[item].price}`,
                message
              );

              return;
            }

            user.coins -=
              SHOP[item].price;

            user.inventory[item]++;

            updateUser(
              sender,
              user
            );

            await reply(
              sock,
              jid,
              `✅ تم الشراء!

🛒 ${SHOP[item].name}
💰 -${SHOP[item].price}

💰 الرصيد:
${user.coins}`,
              message
            );

            return;
          }

          // ====================================
          // INVENTORY
          // ====================================

          if (
            command === "مخزوني" ||
            command === "inventory"
          ) {

            const user =
              getUser(sender);

            await reply(
              sock,
              jid,
              `🎒 مخزونك

⭐ VIP: ${user.inventory.vip}
🎁 Gift: ${user.inventory.gift}
🛡️ Armor: ${user.inventory.armor}
💎 Diamond: ${user.inventory.diamond}`,
              message
            );

            return;
          }

          // ====================================
          // TRANSFER
          // ====================================

          if (
            command === "تحويل" ||
            command === "transfer"
          ) {

            const mentions =
              getMentions(message);

            const target =
              mentions[0] ||
              getQuotedUser(message);

            const amount =
              parseInt(args[0]);

            if (!target) {

              await reply(
                sock,
                jid,
                "❌ منشن الشخص لي بغيتي تحول ليه.",
                message
              );

              return;
            }

            if (
              !amount ||
              amount <= 0
            ) {

              await reply(
                sock,
                jid,
                "❌ دخل مبلغ صحيح.",
                message
              );

              return;
            }

            const from =
              getUser(sender);

            if (
              from.coins <
              amount
            ) {

              await reply(
                sock,
                jid,
                "❌ ما عندكش هاد المبلغ.",
                message
              );

              return;
            }

            const to =
              getUser(target);

            from.coins -= amount;
            to.coins += amount;

            updateUser(
              sender,
              from
            );

            updateUser(
              target,
              to
            );

            await reply(
              sock,
              jid,
              `✅ تم التحويل!

💰 المبلغ:
${amount}

👤 إلى:
@${normalizeNumber(
                target
              )}

💰 رصيدك:
${from.coins}`,
              message
            );

            return;
          }

          // ====================================
          // TOP
          // ====================================

          if (
            command === "متصدرين" ||
            command === "top"
          ) {

            const users =
              loadUsers();

            const top =
              Object.entries(users)
                .sort(
                  (a, b) =>
                    (b[1].coins || 0) -
                    (a[1].coins || 0)
                )
                .slice(0, 10);

            let result =
              "🏆 متصدرين SPOPO\n\n";

            top.forEach(
              ([id, user], index) => {

                result +=
                  `${index + 1}. @${normalizeNumber(
                    id
                  )} — ${user.coins || 0} 💰\n`;
              }
            );

            await reply(
              sock,
              jid,
              result,
              message
            );

            return;
          }

          // ====================================
          // RANKS
          // ====================================

          if (
            command === "رتب" ||
            command === "ranks"
          ) {

            await reply(
              sock,
              jid,
              `👑 رتب SPOPO

1️⃣ مواطن
2️⃣ مميز
3️⃣ مشرف
4️⃣ نائب
5️⃣ رئيس
6️⃣ ملاك`,
              message
            );

            return;
          }

          // ====================================
          // GROUP ONLY
          // ====================================

          if (
            !jid.endsWith(
              "@g.us"
            )
          ) {
            return;
          }

          const metadata =
            await sock.groupMetadata(
              jid
            );

          const admin =
            isAdmin(
              sender,
              metadata
            );

          // ====================================
          // GROUP INFO
          // ====================================

          if (
            command === "معلومات" ||
            command === "groupinfo"
          ) {

            await reply(
              sock,
              jid,
              `📋 معلومات المجموعة

📝 الاسم:
${metadata.subject}

👥 الأعضاء:
${metadata.participants.length}

👑 الأدمنية:
${
  metadata.participants.filter(
    p => p.admin
  ).length
}

🆔:
${jid}`,
              message
            );

            return;
          }

          // ====================================
          // MENTION ALL
          // ====================================

          if (
            command === "منشن" ||
            command === "منشن_الكل"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const mentions =
              metadata.participants.map(
                p => p.id
              );

            const mentionText =
              args.join(" ") ||
              "📢 منشن للجميع";

            await sock.sendMessage(
              jid,
              {
                text:
                  mentionText,
                mentions
              },
              {
                quoted: message
              }
            );

            return;
          }

          // ====================================
          // KICK
          // ====================================

          if (
            command === "طرد" ||
            command === "kick"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              getMentions(message)[0] ||
              getQuotedUser(message);

            if (!target) {

              await reply(
                sock,
                jid,
                "❌ منشن الشخص لي بغيتي تطرد.",
                message
              );

              return;
            }

            if (
              normalizeNumber(
                target
              ) === BOT_NUMBER
            ) {

              await reply(
                sock,
                jid,
                "😂 ما نقدرش نطرد راسي.",
                message
              );

              return;
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "remove"
              );

              await reply(
                sock,
                jid,
                "✅ تم الطرد.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ تأكد أن البوت أدمن.",
                message
              );
            }

            return;
          }

          // ====================================
          // ADD
          // ====================================

          if (
            command === "اضف" ||
            command === "add"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const number =
              (
                args[0] || ""
              ).replace(
                /\D/g,
                ""
              );

            if (!number) {

              await reply(
                sock,
                jid,
                "❌ مثال:\n.اضف 2126xxxxxxxx",
                message
              );

              return;
            }

            const target =
              `${number}@s.whatsapp.net`;

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "add"
              );

              await reply(
                sock,
                jid,
                "✅ تمت محاولة إضافة العضو.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نضيفو.",
                message
              );
            }

            return;
          }

          // ====================================
          // PROMOTE ADMIN
          // ====================================

          if (
            command === "ترقية_ادمن" ||
            command === "promoteadmin"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              getMentions(message)[0] ||
              getQuotedUser(message);

            if (!target) {

              await reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );

              return;
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "promote"
              );

              await reply(
                sock,
                jid,
                "✅ تمت ترقية العضو لأدمن.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ فشلت العملية.",
                message
              );
            }

            return;
          }

          // ====================================
          // DEMOTE ADMIN
          // ====================================

          if (
            command === "تنزيل_ادمن" ||
            command === "demoteadmin"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              getMentions(message)[0] ||
              getQuotedUser(message);

            if (!target) {

              await reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );

              return;
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "demote"
              );

              await reply(
                sock,
                jid,
                "✅ تمت إزالة الأدمن.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ فشلت العملية.",
                message
              );
            }

            return;
          }

          // ====================================
          // GROUP NAME
          // ====================================

          if (
            command === "اسم" ||
            command === "setname"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const name =
              args.join(" ");

            if (!name) {

              await reply(
                sock,
                jid,
                "❌ دخل الاسم الجديد.",
                message
              );

              return;
            }

            try {

              await sock.groupUpdateSubject(
                jid,
                name
              );

              await reply(
                sock,
                jid,
                "✅ تبدل اسم المجموعة.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نبدل الاسم.",
                message
              );
            }

            return;
          }

          // ====================================
          // DESCRIPTION
          // ====================================

          if (
            command === "وصف" ||
            command === "setdesc"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const description =
              args.join(" ");

            if (!description) {

              await reply(
                sock,
                jid,
                "❌ دخل الوصف الجديد.",
                message
              );

              return;
            }

            try {

              await sock.groupUpdateDescription(
                jid,
                description
              );

              await reply(
                sock,
                jid,
                "✅ تبدل وصف المجموعة.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نبدل الوصف.",
                message
              );
            }

            return;
          }

          // ====================================
          // GROUP LINK
          // ====================================

          if (
            command === "رابط" ||
            command === "link"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            try {

              const code =
                await sock.groupInviteCode(
                  jid
                );

              await reply(
                sock,
                jid,
                `🔗 رابط المجموعة:

https://chat.whatsapp.com/${code}`,
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نجيب الرابط.",
                message
              );
            }

            return;
          }

          // ====================================
          // REVOKE LINK
          // ====================================

          if (
            command === "سحب_الرابط" ||
            command === "revoke"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            try {

              await sock.groupRevokeInvite(
                jid
              );

              await reply(
                sock,
                jid,
                "✅ تسحب الرابط القديم.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نسحب الرابط.",
                message
              );
            }

            return;
          }

          // ====================================
          // LOCK
          // ====================================

          if (
            command === "قفل" ||
            command === "lock"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            try {

              await sock.groupSettingUpdate(
                jid,
                "announcement"
              );

              await reply(
                sock,
                jid,
                "🔒 المجموعة تسدات.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نقفل المجموعة.",
                message
              );
            }

            return;
          }

          // ====================================
          // UNLOCK
          // ====================================

          if (
            command === "فتح" ||
            command === "unlock"
          ) {

            if (!admin) {

              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            try {

              await sock.groupSettingUpdate(
                jid,
                "not_announcement"
              );

              await reply(
                sock,
                jid,
                "🔓 المجموعة تحلات.",
                message
              );

            } catch (error) {

              await reply(
                sock,
                jid,
                "❌ ما قدرتش نفتح المجموعة.",
                message
              );
            }

            return;
          }

        } catch (error) {

          console.log(
            "❌ Message Error:",
            error?.message ||
            error
          );
        }
      }
    );

  } catch (error) {

    starting = false;

    console.log("");
    console.log(
      "❌ START ERROR:",
      error?.message ||
      error
    );
    console.log("");

    if (!reconnectTimer) {

      reconnectTimer =
        setTimeout(
          async () => {

            reconnectTimer = null;

            try {
              await startBot();
            } catch (err) {
              console.log(
                "❌ Restart error:",
                err.message
              );
            }

          },
          7000
        );
    }
  }
}

// =================================================
// START
// =================================================

startBot();
