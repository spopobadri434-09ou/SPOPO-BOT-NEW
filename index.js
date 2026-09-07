import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers
} from "@whiskeysockets/baileys";

import P from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";
import http from "http";

const BOT_NUMBER = "212644140800";
const OWNER_NUMBER = "212644140800";
const PREFIX = ".";

const SESSION_DIR = "./session";
const DATA_DIR = "./data";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PORT = process.env.PORT || 3000;

fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "{}", "utf8");
}

/* =========================
   RAILWAY
========================= */

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("SPOPO BOT ONLINE");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Railway PORT: ${PORT}`);
});

/* =========================
   DATABASE
========================= */

function loadUsers() {
  try {
    const data = fs.readFileSync(
      USERS_FILE,
      "utf8"
    );

    return data.trim()
      ? JSON.parse(data)
      : {};
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(users, null, 2),
    "utf8"
  );
}

function newUser() {
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

function getUser(jid) {
  const users = loadUsers();

  if (!users[jid]) {
    users[jid] = newUser();
    saveUsers(users);
  }

  return users[jid];
}

function updateUser(jid, user) {
  const users = loadUsers();

  users[jid] = user;

  saveUsers(users);
}

/* =========================
   RANKS
========================= */

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

const RANK_ORDER = [
  "citizen",
  "vip",
  "moderator",
  "deputy",
  "president",
  "owner"
];

function rankName(rank) {
  return RANKS[rank]?.name || "مواطن";
}

/* =========================
   SHOP
========================= */

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

/* =========================
   HELPERS
========================= */

function numberOf(jid = "") {
  return jid
    .split(":")[0]
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "");
}

function isOwner(jid) {
  const number = numberOf(jid);

  return (
    number === BOT_NUMBER ||
    number === OWNER_NUMBER
  );
}

function getText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

function getMentions(message) {
  return (
    message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || []
  );
}

function getQuotedUser(message) {
  return (
    message
      ?.extendedTextMessage
      ?.contextInfo
      ?.participant || null
  );
}

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
      "❌ Send Error:",
      error?.message || error
    );
  }
}

function isAdmin(
  jid,
  metadata
) {
  if (isOwner(jid)) {
    return true;
  }

  const participant =
    metadata.participants.find(
      p =>
        numberOf(p.id) ===
        numberOf(jid)
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

/* =========================
   DAILY
========================= */

const daily = new Map();

/* =========================
   START BOT
========================= */

let starting = false;
let reconnectTimer = null;

async function startBot() {
  if (starting) return;

  starting = true;

  try {
    console.log("");
    console.log("==============================");
    console.log("🤖 SPOPO BOT");
    console.log(
      `📱 NUMBER: ${BOT_NUMBER}`
    );
    console.log("📷 QR CODE: ON");
    console.log("🔐 PAIRING CODE: OFF");
    console.log("==============================");
    console.log("");

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        SESSION_DIR
      );

    const sock =
      makeWASocket({
        auth: state,

        logger: P({
          level: "silent"
        }),

        browser:
          Browsers.macOS(
            "Desktop"
          ),

        /*
         * WhatsApp/Baileys لم يعد
         * يطبع QR تلقائياً.
         */
        printQRInTerminal: false,

        generateHighQualityLinkPreview:
          false,

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false
      });

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    /* =====================
       CONNECTION
    ===================== */

    sock.ev.on(
      "connection.update",
      async update => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        /*
         * QR صغير
         */
        if (qr) {

          console.log("");
          console.log(
            "========== QR =========="
          );

          qrcode.generate(
            qr,
            {
              small: true
            }
          );

          console.log(
            "======== END QR ========"
          );

          console.log(
            "📱 WhatsApp > الأجهزة المرتبطة > ربط جهاز"
          );

          console.log("");
        }

        if (
          connection ===
          "connecting"
        ) {

          console.log(
            "⏳ WhatsApp كيتاصل..."
          );
        }

        if (
          connection === "open"
        ) {

          starting = false;

          console.log("");
          console.log(
            "=============================="
          );
          console.log(
            "✅ SPOPO BOT CONNECTED"
          );
          console.log(
            "🤖 BOT ONLINE"
          );
          console.log(
            "📷 QR LOGIN SUCCESS"
          );
          console.log(
            "=============================="
          );
          console.log("");
        }

        if (
          connection === "close"
        ) {

          starting = false;

          const status =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            `⚠️ Connection closed: ${
              status || "unknown"
            }`
          );

          if (
            status ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "❌ Session logged out."
            );

            return;
          }

          if (
            !reconnectTimer
          ) {

            reconnectTimer =
              setTimeout(
                async () => {

                  reconnectTimer =
                    null;

                  await startBot();

                },
                7000
              );
          }
        }
      }
    );

    /* =====================
       MESSAGES
    ===================== */

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        try {

          const message =
            messages?.[0];

          if (
            !message ||
            message.key?.fromMe
          ) {
            return;
          }

          const jid =
            message.key
              .remoteJid;

          if (!jid) return;

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
              .slice(
                PREFIX.length
              )
              .trim()
              .split(/\s+/);

          const command =
            (
              parts.shift() ||
              ""
            ).toLowerCase();

          const args = parts;

          const sender =
            message.key
              .participant ||
            jid;

          getUser(sender);

          /* =====================
             HELP
          ===================== */

          if (
            [
              "مساعدة",
              "اوامر",
              "help",
              "menu"
            ].includes(command)
          ) {

            return reply(
              sock,
              jid,

`🤖 قائمة أوامر SPOPO

📌 أساسية:
.بينغ
.بوت
.ايدي
.مساعدة

💰 اقتصاد:
.حسابي
.يومية
.متجر
.شراء vip
.مخزوني
.تحويل 100 + منشن
.متصدرين

👑 رتب:
.رتب
.ترقية + منشن
.تنزيل + منشن

👥 المجموعة:
.معلومات
.منشن
.طرد + منشن
.اضف 2126xxxxxxx
.ترقية_ادمن + منشن
.تنزيل_ادمن + منشن
.اسم الاسم
.وصف الوصف
.رابط
.سحب_الرابط
.قفل
.فتح`,

              message
            );
          }

          /* =====================
             BASIC
          ===================== */

          if (
            command === "بينغ" ||
            command === "ping"
          ) {

            return reply(
              sock,
              jid,
              "🏓 Pong!\n🤖 SPOPO BOT خدام.",
              message
            );
          }

          if (
            command === "بوت" ||
            command === "bot"
          ) {

            return reply(
              sock,
              jid,

`🤖 SPOPO BOT

✅ Online
⚡ Railway
📷 QR: ON
🔐 Pairing: OFF`,

              message
            );
          }

          if (
            command === "ايدي" ||
            command === "id"
          ) {

            return reply(
              sock,
              jid,
              `🆔 ID:\n${sender}`,
              message
            );
          }

          /* =====================
             PROFILE
          ===================== */

          if (
            command === "حسابي" ||
            command === "profile"
          ) {

            const u =
              getUser(sender);

            return reply(
              sock,
              jid,

`👤 حسابك

💰 العملات: ${u.coins}
⭐ XP: ${u.xp}
📈 المستوى: ${u.level}
👑 الرتبة: ${rankName(u.rank)}

🎒 المخزون:

⭐ VIP: ${u.inventory.vip}
🎁 Gift: ${u.inventory.gift}
🛡️ Armor: ${u.inventory.armor}
💎 Diamond: ${u.inventory.diamond}`,

              message
            );
          }

          /* =====================
             DAILY
          ===================== */

          if (
            command === "يومية" ||
            command === "daily"
          ) {

            const now =
              Date.now();

            const last =
              daily.get(
                sender
              ) || 0;

            const cooldown =
              24 *
              60 *
              60 *
              1000;

            if (
              now - last <
              cooldown
            ) {

              const hours =
                Math.ceil(
                  (
                    cooldown -
                    (
                      now - last
                    )
                  ) /
                  3600000
                );

              return reply(
                sock,
                jid,

`⏳ رجع غداً.

باقي تقريباً ${hours} ساعة.`,

                message
              );
            }

            const u =
              getUser(sender);

            const reward =
              500 +
              Math.floor(
                Math.random() *
                500
              );

            u.coins +=
              reward;

            u.xp += 20;

            while (
              u.xp >=
              u.level * 100
            ) {

              u.xp -=
                u.level * 100;

              u.level++;
            }

            updateUser(
              sender,
              u
            );

            daily.set(
              sender,
              now
            );

            return reply(
              sock,
              jid,

`🎁 اليومية وصلات!

💰 +${reward} عملة
⭐ +20 XP
📈 المستوى: ${u.level}
💰 الرصيد: ${u.coins}`,

              message
            );
          }

          /* =====================
             SHOP
          ===================== */

          if (
            command === "متجر" ||
            command === "shop"
          ) {

            return reply(
              sock,
              jid,

`🛒 متجر SPOPO

⭐ vip = ${SHOP.vip.price}
🎁 gift = ${SHOP.gift.price}
🛡️ armor = ${SHOP.armor.price}
💎 diamond = ${SHOP.diamond.price}

مثال:
.شراء vip`,

              message
            );
          }

          if (
            command === "شراء" ||
            command === "buy"
          ) {

            const item =
              (
                args[0] ||
                ""
              ).toLowerCase();

            if (
              !SHOP[item]
            ) {

              return reply(
                sock,
                jid,
                "❌ السلعة غير موجودة.\nاستعمل .متجر",
                message
              );
            }

            const u =
              getUser(sender);

            if (
              u.coins <
              SHOP[item].price
            ) {

              return reply(
                sock,
                jid,

`❌ العملات ما كافياش.

💰 عندك: ${u.coins}
💵 الثمن: ${SHOP[item].price}`,

                message
              );
            }

            u.coins -=
              SHOP[item].price;

            u.inventory[item]++;

            updateUser(
              sender,
              u
            );

            return reply(
              sock,
              jid,

`✅ تم الشراء!

🛒 ${SHOP[item].name}
💰 -${SHOP[item].price}
💰 الرصيد: ${u.coins}`,

              message
            );
          }

          /* =====================
             INVENTORY
          ===================== */

          if (
            command ===
              "مخزوني" ||
            command ===
              "inventory"
          ) {

            const u =
              getUser(sender);

            return reply(
              sock,
              jid,

`🎒 مخزونك

⭐ VIP: ${u.inventory.vip}
🎁 Gift: ${u.inventory.gift}
🛡️ Armor: ${u.inventory.armor}
💎 Diamond: ${u.inventory.diamond}`,

              message
            );
          }

          /* =====================
             TRANSFER
          ===================== */

          if (
            command ===
              "تحويل" ||
            command ===
              "transfer"
          ) {

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            const amount =
              parseInt(
                args[0],
                10
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
              !Number.isInteger(
                amount
              ) ||
              amount <= 0
            ) {

              return reply(
                sock,
                jid,
                "❌ دخل مبلغ صحيح.",
                message
              );
            }

            const from =
              getUser(sender);

            if (
              from.coins <
              amount
            ) {

              return reply(
                sock,
                jid,
                "❌ ما عندكش هاد المبلغ.",
                message
              );
            }

            const to =
              getUser(target);

            from.coins -=
              amount;

            to.coins +=
              amount;

            updateUser(
              sender,
              from
            );

            updateUser(
              target,
              to
            );

            return reply(
              sock,
              jid,

`✅ تم التحويل!

💰 المبلغ: ${amount}
👤 إلى: @${numberOf(target)}
💰 رصيدك: ${from.coins}`,

              message
            );
          }

          /* =====================
             TOP
          ===================== */

          if (
            command ===
              "متصدرين" ||
            command ===
              "top"
          ) {

            const top =
              Object.entries(
                loadUsers()
              )
                .sort(
                  (a, b) =>
                    (b[1].coins || 0) -
                    (a[1].coins || 0)
                )
                .slice(
                  0,
                  10
                );

            let out =
              "🏆 متصدرين SPOPO\n\n";

            top.forEach(
              (
                [id, u],
                i
              ) => {

                out +=
                  `${i + 1}. @${numberOf(id)} — ${u.coins || 0} 💰\n`;
              }
            );

            return reply(
              sock,
              jid,
              out,
              message
            );
          }

          /* =====================
             RANKS
          ===================== */

          if (
            command ===
              "رتب" ||
            command ===
              "ranks"
          ) {

            return reply(
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
          }

          /* =====================
             PROMOTE
          ===================== */

          if (
            command ===
              "ترقية" ||
            command ===
              "promote"
          ) {

            if (
              !isOwner(sender)
            ) {

              return reply(
                sock,
                jid,
                "❌ غير الملاك يقدر يدير هاد العملية.",
                message
              );
            }

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            if (!target) {

              return reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );
            }

            const u =
              getUser(target);

            const current =
              RANKS[u.rank]
                ?.level || 1;

            if (
              current >= 5
            ) {

              return reply(
                sock,
                jid,
                "❌ وصل لأعلى رتبة.",
                message
              );
            }

            u.rank =
              RANK_ORDER[
                current
              ];

            updateUser(
              target,
              u
            );

            return reply(
              sock,
              jid,

`✅ تمت الترقية!

👑 الرتبة الجديدة:
${rankName(u.rank)}`,

              message
            );
          }

          /* =====================
             DEMOTE
          ===================== */

          if (
            command ===
              "تنزيل" ||
            command ===
              "demote"
          ) {

            if (
              !isOwner(sender)
            ) {

              return reply(
                sock,
                jid,
                "❌ غير الملاك يقدر يدير هاد العملية.",
                message
              );
            }

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            if (!target) {

              return reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );
            }

            const u =
              getUser(target);

            const current =
              RANKS[u.rank]
                ?.level || 1;

            if (
              current <= 1
            ) {

              return reply(
                sock,
                jid,
                "❌ راه مواطن أصلاً.",
                message
              );
            }

            u.rank =
              RANK_ORDER[
                current - 2
              ];

            updateUser(
              target,
              u
            );

            return reply(
              sock,
              jid,

`⬇️ تم التنزيل!

👑 الرتبة:
${rankName(u.rank)}`,

              message
            );
          }

          /* =====================
             GROUP ONLY
          ===================== */

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

          /* GROUP INFO */

          if (
            command ===
              "معلومات" ||
            command ===
              "groupinfo"
          ) {

            return reply(
              sock,
              jid,

`📋 معلومات المجموعة

📝 الاسم: ${metadata.subject}
👥 الأعضاء: ${metadata.participants.length}
👑 الأدمنية: ${
                metadata.participants.filter(
                  p => p.admin
                ).length
              }`,

              message
            );
          }

          /* MENTION */

          if (
            command ===
              "منشن" ||
            command ===
              "منشن_الكل"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const all =
              metadata.participants.map(
                p => p.id
              );

            const txt =
              args.join(" ") ||
              "📢 منشن للجميع";

            return sock.sendMessage(
              jid,
              {
                text: txt,
                mentions: all
              },
              {
                quoted: message
              }
            );
          }

          /* KICK */

          if (
            command ===
              "طرد" ||
            command ===
              "kick"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            if (!target) {

              return reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "remove"
              );

              return reply(
                sock,
                jid,
                "✅ تم الطرد.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ تأكد أن البوت أدمن.",
                message
              );
            }
          }

          /* ADD */

          if (
            command ===
              "اضف" ||
            command ===
              "add"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const number =
              (
                args[0] ||
                ""
              ).replace(
                /\D/g,
                ""
              );

            if (!number) {

              return reply(
                sock,
                jid,
                "❌ مثال: .اضف 2126xxxxxxxx",
                message
              );
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [
                  `${number}@s.whatsapp.net`
                ],
                "add"
              );

              return reply(
                sock,
                jid,
                "✅ تمت محاولة إضافة العضو.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نضيفو.",
                message
              );
            }
          }

          /* PROMOTE ADMIN */

          if (
            command ===
              "ترقية_ادمن" ||
            command ===
              "promoteadmin"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            if (!target) {

              return reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "promote"
              );

              return reply(
                sock,
                jid,
                "✅ تمت الترقية لأدمن.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ تأكد أن البوت أدمن.",
                message
              );
            }
          }

          /* DEMOTE ADMIN */

          if (
            command ===
              "تنزيل_ادمن" ||
            command ===
              "demoteadmin"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const target =
              getMentions(
                message
              )[0] ||
              getQuotedUser(
                message
              );

            if (!target) {

              return reply(
                sock,
                jid,
                "❌ منشن الشخص.",
                message
              );
            }

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                "demote"
              );

              return reply(
                sock,
                jid,
                "✅ تمت إزالة الأدمن.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ تأكد أن البوت أدمن.",
                message
              );
            }
          }

          /* GROUP NAME */

          if (
            command ===
              "اسم" ||
            command ===
              "setname"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const name =
              args.join(" ");

            if (!name) {

              return reply(
                sock,
                jid,
                "❌ دخل الاسم الجديد.",
                message
              );
            }

            try {

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

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نبدل الاسم.",
                message
              );
            }
          }

          /* DESCRIPTION */

          if (
            command ===
              "وصف" ||
            command ===
              "setdesc"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            const description =
              args.join(" ");

            if (!description) {

              return reply(
                sock,
                jid,
                "❌ دخل الوصف الجديد.",
                message
              );
            }

            try {

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

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نبدل الوصف.",
                message
              );
            }
          }

          /* LINK */

          if (
            command ===
              "رابط" ||
            command ===
              "link"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            try {

              const code =
                await sock.groupInviteCode(
                  jid
                );

              return reply(
                sock,
                jid,

`🔗 رابط المجموعة:

https://chat.whatsapp.com/${code}`,

                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نجيب الرابط.",
                message
              );
            }
          }

          /* REVOKE */

          if (
            command ===
              "سحب_الرابط" ||
            command ===
              "revoke"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            try {

              await sock.groupRevokeInvite(
                jid
              );

              return reply(
                sock,
                jid,
                "✅ تسحب الرابط القديم.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نسحب الرابط.",
                message
              );
            }
          }

          /* LOCK */

          if (
            command ===
              "قفل" ||
            command ===
              "lock"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            try {

              await sock.groupSettingUpdate(
                jid,
                "announcement"
              );

              return reply(
                sock,
                jid,
                "🔒 المجموعة تسدات.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نقفل المجموعة.",
                message
              );
            }
          }

          /* UNLOCK */

          if (
            command ===
              "فتح" ||
            command ===
              "unlock"
          ) {

            if (!admin) {

              return reply(
                sock,
                jid,
                "❌ خاصك تكون أدمن.",
                message
              );
            }

            try {

              await sock.groupSettingUpdate(
                jid,
                "not_announcement"
              );

              return reply(
                sock,
                jid,
                "🔓 المجموعة تحلات.",
                message
              );

            } catch {

              return reply(
                sock,
                jid,
                "❌ ما قدرتش نفتح المجموعة.",
                message
              );
            }
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

    console.log(
      "❌ START ERROR:",
      error?.message ||
      error
    );

    if (
      !reconnectTimer
    ) {

      reconnectTimer =
        setTimeout(
          async () => {

            reconnectTimer =
              null;

            await startBot();

          },
          7000
        );
    }
  }
}

startBot();
