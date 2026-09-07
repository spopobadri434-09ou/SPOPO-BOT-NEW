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

// =====================================================
// SPOPO BOT
// Railway + WhatsApp Pairing Code
// =====================================================

// ================= CONFIG =================

const BOT_NUMBER = "212644140800";
const OWNER_NUMBER = "212644140800";

const PREFIX = ".";

const SESSION_DIR = "./session";
const DATA_DIR = "./data";
const USERS_FILE = path.join(DATA_DIR, "users.json");

const PORT = process.env.PORT || 3000;

// ================= DIRECTORIES =================

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "{}", "utf8");
}

// ================= HTTP SERVER =================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("SPOPO BOT ONLINE");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ================= DATABASE =================

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, "{}", "utf8");
    }

    const data = fs.readFileSync(USERS_FILE, "utf8");

    if (!data.trim()) return {};

    return JSON.parse(data);
  } catch (error) {
    console.log("⚠️ خطأ في قراءة users.json");
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
    console.log("❌ خطأ في حفظ البيانات:", error.message);
  }
}

// ================= USERS =================

function ensureUser(jid) {
  const users = loadUsers();

  if (!users[jid]) {
    users[jid] = {
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

    saveUsers(users);
  }

  return users[jid];
}

function getUser(jid) {
  return ensureUser(jid);
}

function updateUser(jid, data) {
  const users = loadUsers();

  if (!users[jid]) {
    users[jid] = {
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

  users[jid] = {
    ...users[jid],
    ...data
  };

  saveUsers(users);
}

// ================= RANKS =================

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

// ================= NORMALIZE JID =================

function normalizeNumber(jid = "") {
  return jid
    .split(":")[0]
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "");
}

function isOwner(jid) {
  return normalizeNumber(jid) === BOT_NUMBER ||
         normalizeNumber(jid) === OWNER_NUMBER;
}

function hasRank(jid, requiredLevel) {
  if (isOwner(jid)) return true;

  const user = getUser(jid);

  return rankLevel(user.rank) >= requiredLevel;
}

// ================= GROUP ADMIN =================

async function isGroupAdmin(sock, jid, groupMetadata) {
  if (isOwner(jid)) return true;

  const participant = groupMetadata.participants.find(
    p => normalizeNumber(p.id) === normalizeNumber(jid)
  );

  return participant?.admin === "admin" ||
         participant?.admin === "superadmin";
}

async function getGroupMetadata(sock, jid) {
  try {
    return await sock.groupMetadata(jid);
  } catch (error) {
    return null;
  }
}

// ================= MENTION =================

function extractMention(message) {
  const context =
    message?.extendedTextMessage?.contextInfo;

  if (!context) return [];

  return context.mentionedJid || [];
}

function quotedParticipant(message) {
  return (
    message?.extendedTextMessage?.contextInfo
      ?.participant || null
  );
}

// ================= SHOP =================

const SHOP = {
  vip: {
    price: 1000,
    name: "⭐ مميز"
  },

  gift: {
    price: 250,
    name: "🎁 هدية"
  },

  armor: {
    price: 500,
    name: "🛡️ درع"
  },

  diamond: {
    price: 2500,
    name: "💎 ألماسة"
  }
};

// ================= DAILY =================

const dailyCooldown = new Map();

// ================= COMMAND HELPER =================

function commandText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

// ================= SEND =================

async function reply(sock, jid, text, message) {
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
    console.log("❌ Send error:", error.message);
  }
}

// ================= BOT START =================

let reconnectTimer = null;
let botStarting = false;

async function startBot() {
  if (botStarting) return;

  botStarting = true;

  try {
    console.log("");
    console.log("================================");
    console.log("🤖 SPOPO BOT");
    console.log("================================");
    console.log(`📱 NUMBER: ${BOT_NUMBER}`);
    console.log("🔐 PAIRING CODE: ON");
    console.log("📷 QR: OFF");
    console.log("================================");
    console.log("");

    const { state, saveCreds } =
      await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
      auth: state,
      logger: P({
        level: "silent"
      }),

      browser: Browsers.macOS("Desktop"),

      printQRInTerminal: false,

      generateHighQualityLinkPreview: false,

      markOnlineOnConnect: false,

      syncFullHistory: false
    });

    let pairingRequested = false;

    // =========================================
    // SAVE AUTH
    // =========================================

    sock.ev.on("creds.update", saveCreds);

    // =========================================
    // CONNECTION
    // =========================================

    sock.ev.on(
      "connection.update",
      async update => {
        const {
          connection,
          lastDisconnect
        } = update;

        // -------------------------------------
        // PAIRING CODE
        // -------------------------------------

        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested
        ) {
          pairingRequested = true;

          try {
            console.log("");
            console.log("⏳ الاتصال بواتساب...");
            console.log("⏳ كنوجد Pairing Code...");
            console.log("");

            // مهم: ننتظرو شوية قبل طلب الكود
            await delay(2000);

            const code =
              await sock.requestPairingCode(
                BOT_NUMBER
              );

            console.log("");
            console.log("================================");
            console.log("🔐 SPOPO BOT PAIRING CODE");
            console.log("================================");
            console.log(`📱 NUMBER: ${BOT_NUMBER}`);
            console.log(`🔑 CODE: ${code}`);
            console.log("================================");
            console.log("");

            console.log("📲 دخل لواتساب:");
            console.log("1️⃣ الإعدادات");
            console.log("2️⃣ الأجهزة المرتبطة");
            console.log("3️⃣ ربط جهاز");
            console.log("4️⃣ الربط برقم الهاتف");
            console.log("5️⃣ دخل الكود لي فوق");
            console.log("");

          } catch (error) {
            console.log("");
            console.log(
              "❌ Pairing Code Error:",
              error?.message || error
            );
            console.log("");

            // ما نعاودوش الطلب مباشرة
            pairingRequested = false;
          }
        }

        // -------------------------------------
        // CONNECTED
        // -------------------------------------

        if (connection === "open") {
          console.log("");
          console.log("================================");
          console.log("✅ SPOPO BOT CONNECTED");
          console.log("🤖 BOT ONLINE");
          console.log(`📱 ${BOT_NUMBER}`);
          console.log("================================");
          console.log("");

          botStarting = false;
        }

        // -------------------------------------
        // CLOSED
        // -------------------------------------

        if (connection === "close") {
          botStarting = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log("");
          console.log("================================");
          console.log("⚠️ CONNECTION CLOSED");
          console.log(
            `📌 STATUS: ${statusCode || "unknown"}`
          );
          console.log("================================");
          console.log("");

          // Logged out
          if (
            statusCode === DisconnectReason.loggedOut
          ) {
            console.log(
              "❌ WhatsApp logged out."
            );

            console.log(
              "⚠️ ما غاديش نعاودو الاتصال تلقائياً."
            );

            return;
          }

          // -----------------------------------
          // RECONNECT ONCE
          // -----------------------------------

          if (!reconnectTimer) {
            console.log(
              "🔄 إعادة الاتصال بعد 7 ثواني..."
            );

            reconnectTimer = setTimeout(
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

    // =========================================
    // MESSAGES
    // =========================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {
        try {
          const message = messages?.[0];

          if (!message) return;

          if (message.key?.fromMe) return;

          const jid = message.key.remoteJid;

          if (!jid) return;

          const text = commandText(message);

          if (!text.startsWith(PREFIX)) {
            return;
          }

          const args = text
            .slice(PREFIX.length)
            .trim()
            .split(/\s+/);

          const command =
            (args.shift() || "").toLowerCase();

          const sender =
            message.key.participant ||
            jid;

          // إنشاء حساب
          const user = getUser(sender);

          // =====================================
          // PING
          // =====================================

          if (command === "بينغ" ||
              command === "ping") {

            await reply(
              sock,
              jid,
              "🏓 Pong!\n🤖 SPOPO BOT خدام مزيان.",
              message
            );

            return;
          }

          // =====================================
          // BOT
          // =====================================

          if (command === "بوت" ||
              command === "bot") {

            await reply(
              sock,
              jid,
              "🤖 SPOPO BOT\n\n✅ Online\n⚡ Railway\n🔐 Pairing Code\n📷 QR: OFF",
              message
            );

            return;
          }

          // =====================================
          // ID
          // =====================================

          if (command === "ايدي" ||
              command === "id") {

            await reply(
              sock,
              jid,
              `🆔 ID ديالك:\n${sender}`,
              message
            );

            return;
          }

          // =====================================
          // MY ACCOUNT
          // =====================================

          if (
            command === "حسابي" ||
            command === "profile"
          ) {
            const u = getUser(sender);

            await reply(
              sock,
              jid,
              `👤 حسابك

💰 العملات: ${u.coins}
⭐ XP: ${u.xp}
📈 المستوى: ${u.level}
👑 الرتبة: ${rankName(u.rank)}

🎒 المخزون:
⭐ VIP: ${u.inventory.vip}
🎁 هدايا: ${u.inventory.gift}
🛡️ دروع: ${u.inventory.armor}
💎 ألماس: ${u.inventory.diamond}`,
              message
            );

            return;
          }

          // =====================================
          // DAILY
          // =====================================

          if (
            command === "يومية" ||
            command === "daily"
          ) {
            const now = Date.now();

            const last =
              dailyCooldown.get(sender) || 0;

            const cooldown =
              24 * 60 * 60 * 1000;

            if (now - last < cooldown) {
              const remaining =
                cooldown - (now - last);

              const hours =
                Math.ceil(
                  remaining /
                  (60 * 60 * 1000)
                );

              await reply(
                sock,
                jid,
                `⏳ رجع غداً.\nباقي تقريباً ${hours} ساعة.`,
                message
              );

              return;
            }

            const reward =
              500 +
              Math.floor(
                Math.random() * 500
              );

            const u = getUser(sender);

            u.coins += reward;
            u.xp += 20;

            if (u.xp >= u.level * 100) {
              u.xp = 0;
              u.level += 1;
            }

            updateUser(sender, u);

            dailyCooldown.set(
              sender,
              now
            );

            await reply(
              sock,
              jid,
              `🎁 اليومية وصلات!

💰 +${reward} عملة
⭐ +20 XP

💰 الرصيد: ${u.coins}`,
              message
            );

            return;
          }

          // =====================================
          // SHOP
          // =====================================

          if (
            command === "متجر" ||
            command === "shop"
          ) {
            await reply(
              sock,
              jid,
              `🛒 متجر SPOPO

⭐ vip — ${SHOP.vip.price}
🎁 gift — ${SHOP.gift.price}
🛡️ armor — ${SHOP.armor.price}
💎 diamond — ${SHOP.diamond.price}

طريقة الشراء:
.شراء vip
.شراء gift
.شراء armor
.شراء diamond`,
              message
            );

            return;
          }

          // =====================================
          // BUY
          // =====================================

          if (
            command === "شراء" ||
            command === "buy"
          ) {
            const item =
              (args[0] || "").toLowerCase();

            if (!SHOP[item]) {
              await reply(
                sock,
                jid,
                "❌ السلعة غير موجودة.\nاستعمل .متجر",
                message
              );

              return;
            }

            const u = getUser(sender);

            if (
              u.coins <
              SHOP[item].price
            ) {
              await reply(
                sock,
                jid,
                `❌ ما عندكش فلوس كافية.\n💰 عندك: ${u.coins}\n💵 الثمن: ${SHOP[item].price}`,
                message
              );

              return;
            }

            u.coins -= SHOP[item].price;

            if (
              !u.inventory[item]
            ) {
              u.inventory[item] = 0;
            }

            u.inventory[item]++;

            updateUser(sender, u);

            await reply(
              sock,
              jid,
              `✅ شريتي ${SHOP[item].name}

💰 -${SHOP[item].price}
💰 الرصيد: ${u.coins}`,
              message
            );

            return;
          }

          // =====================================
          // INVENTORY
          // =====================================

          if (
            command === "مخزوني" ||
            command === "inventory"
          ) {
            const u = getUser(sender);

            await reply(
              sock,
              jid,
              `🎒 المخزون ديالك

⭐ VIP: ${u.inventory.vip}
🎁 Gift: ${u.inventory.gift}
🛡️ Armor: ${u.inventory.armor}
💎 Diamond: ${u.inventory.diamond}`,
              message
            );

            return;
          }

          // =====================================
          // TRANSFER
          // =====================================

          if (
            command === "تحويل" ||
            command === "transfer"
          ) {
            const mentioned =
              extractMention(message);

            const target =
              mentioned[0] ||
              quotedParticipant(message);

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
              from.coins < amount
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
              `✅ تم التحويل

💰 المبلغ: ${amount}
👤 إلى: @${normalizeNumber(target)}
💰 رصيدك: ${from.coins}`,
              message
            );

            return;
          }

          // =====================================
          // LEADERBOARD
          // =====================================

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
              ([id, u], index) => {
                result +=
                  `${index + 1}. @${normalizeNumber(id)} — ${u.coins || 0} 💰\n`;
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

          // =====================================
          // RANKS
          // =====================================

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

          // =====================================
          // UPGRADE RANK
          // =====================================

          if (
            command === "ترقية" ||
            command === "promote"
          ) {
            if (
              !hasRank(sender, 5)
            ) {
              await reply(
                sock,
                jid,
                "❌ ما عندكش الصلاحية.",
                message
              );

              return;
            }

            const target =
              extractMention(message)[0] ||
              quotedParticipant(message);

            const newRank =
              args[0]?.toLowerCase();

            if (!target || !newRank) {
              await reply(
                sock,
                jid,
                "❌ مثال:\n.ترقية @user vip",
                message
              );

              return;
            }

            if (!RANKS[newRank]) {
              await reply(
                sock,
                jid,
                "❌ الرتبة غير موجودة.\nاستعمل .رتب",
                message
              );

              return;
            }

            const targetUser =
              getUser(target);

            targetUser.rank =
              newRank;

            updateUser(
              target,
              targetUser
            );

            await reply(
              sock,
              jid,
              `✅ تمت الترقية إلى ${rankName(newRank)}`,
              message
            );

            return;
          }

          // =====================================
          // DEMOTE
          // =====================================

          if (
            command === "تنزيل" ||
            command === "demote"
          ) {
            if (
              !hasRank(sender, 5)
            ) {
              await reply(
                sock,
                jid,
                "❌ ما عندكش الصلاحية.",
                message
              );

              return;
            }

            const target =
              extractMention(message)[0] ||
              quotedParticipant(message);

            if (!target) {
              await reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );

              return;
            }

            const targetUser =
              getUser(target);

            targetUser.rank =
              "citizen";

            updateUser(
              target,
              targetUser
            );

            await reply(
              sock,
              jid,
              "✅ رجعناه مواطن.",
              message
            );

            return;
          }

          // =====================================
          // GROUP CHECK
          // =====================================

          if (!jid.endsWith("@g.us")) {
            return;
          }

          const group =
            await getGroupMetadata(
              sock,
              jid
            );

          if (!group) {
            await reply(
              sock,
              jid,
              "❌ ما قدرتش نجيب معلومات المجموعة.",
              message
            );

            return;
          }

          const senderIsAdmin =
            await isGroupAdmin(
              sock,
              sender,
              group
            );

          // =====================================
          // GROUP INFO
          // =====================================

          if (
            command === "معلومات" ||
            command === "groupinfo"
          ) {
            await reply(
              sock,
              jid,
              `📋 معلومات المجموعة

👥 الأعضاء: ${group.participants.length}
👑 المشرفين: ${
                group.participants.filter(
                  p => p.admin
                ).length
              }

📝 الاسم:
${group.subject}

🆔:
${jid}`,
              message
            );

            return;
          }

          // =====================================
          // MENTION ALL
          // =====================================

          if (
            command === "منشن" ||
            command === "منشن_الكل"
          ) {
            if (!senderIsAdmin) {
              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const mentions =
              group.participants.map(
                p => p.id
              );

            const text =
              args.join(" ") ||
              "📢 منشن للجميع";

            await sock.sendMessage(
              jid,
              {
                text,
                mentions
              },
              {
                quoted: message
              }
            );

            return;
          }

          // =====================================
          // KICK
          // =====================================

          if (
            command === "طرد" ||
            command === "kick"
          ) {
            if (!senderIsAdmin) {
              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              extractMention(message)[0] ||
              quotedParticipant(message);

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
              normalizeNumber(target) ===
              BOT_NUMBER
            ) {
              await reply(
                sock,
                jid,
                "❌ ما نقدرش نطرد راسي 😂",
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
                "❌ ما قدرتش نطردو. تأكد أن البوت أدمن.",
                message
              );
            }

            return;
          }

          // =====================================
          // ADD
          // =====================================

          if (
            command === "اضف" ||
            command === "add"
          ) {
            if (!senderIsAdmin) {
              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const number =
              (args[0] || "")
                .replace(/\D/g, "");

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
                "✅ تم إرسال طلب الإضافة.",
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

          // =====================================
          // PROMOTE ADMIN
          // =====================================

          if (
            command === "ترقية_ادمن" ||
            command === "promoteadmin"
          ) {
            if (!senderIsAdmin) {
              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              extractMention(message)[0] ||
              quotedParticipant(message);

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
                "✅ تمت الترقية لأدمن.",
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

          // =====================================
          // DEMOTE ADMIN
          // =====================================

          if (
            command === "تنزيل_ادمن" ||
            command === "demoteadmin"
          ) {
            if (!senderIsAdmin) {
              await reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );

              return;
            }

            const target =
              extractMention(message)[0] ||
              quotedParticipant(message);

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
                "✅ تنحى من الأدمن.",
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

          // =====================================
          // CHANGE GROUP NAME
          // =====================================

          if (
            command === "اسم" ||
            command === "setname"
          ) {
            if (!senderIsAdmin) {
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

          // =====================================
          // DESCRIPTION
          // =====================================

          if (
            command === "وصف" ||
            command === "setdesc"
          ) {
            if (!senderIsAdmin) {
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

          // =====================================
          // GROUP LINK
          // =====================================

          if (
            command === "رابط" ||
            command === "link"
          ) {
            if (!senderIsAdmin) {
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

          // =====================================
          // REVOKE LINK
          // =====================================

          if (
            command === "سحب_الرابط" ||
            command === "revoke"
          ) {
            if (!senderIsAdmin) {
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
                "✅ تسحب رابط المجموعة القديم.",
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

          // =====================================
          // LOCK GROUP
          // =====================================

          if (
            command === "قفل" ||
            command === "lock"
          ) {
            if (!senderIsAdmin) {
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
                "🔒 المجموعة تسدات.\nغير الأدمن يقدر يكتب.",
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

          // =====================================
          // UNLOCK GROUP
          // =====================================

          if (
            command === "فتح" ||
            command === "unlock"
          ) {
            if (!senderIsAdmin) {
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
                "🔓 المجموعة تحلات.\nالكل يقدر يكتب.",
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
            error?.message || error
          );
        }
      }
    );

  } catch (error) {
    botStarting = false;

    console.log("");
    console.log(
      "❌ START BOT ERROR:",
      error?.message || error
    );
    console.log("");

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(
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

// ================= START =================

startBot();
