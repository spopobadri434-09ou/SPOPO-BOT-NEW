const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");

const PREFIX = ".";
const BOT_NUMBER = process.env.BOT_NUMBER || "";
const OWNER_NUMBER = process.env.OWNER_NUMBER || BOT_NUMBER;
const AUTH_DIR = "./auth_info";
const DATA_FILE = "./data.json";

let db = { users: {}, groups: {} };

if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {}
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function clean(n) {
  return String(n || "").replace(/\D/g, "");
}

function sender(msg) {
  return msg.key.participant || msg.key.remoteJid;
}

function isGroup(jid) {
  return jid && jid.endsWith("@g.us");
}

function user(id, name = "") {
  if (!db.users[id]) {
    db.users[id] = {
      name: name || "مواطن",
      coins: 1000,
      xp: 0,
      level: 1,
      rank: "مواطن",
      warns: 0
    };
  }

  if (name) db.users[id].name = name;
  return db.users[id];
}

function group(id) {
  if (!db.groups[id]) {
    db.groups[id] = {
      welcome: true,
      antiLink: false
    };
  }

  return db.groups[id];
}

function text(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  );
}

function target(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  return ctx?.mentionedJid?.[0] || ctx?.participant || null;
}

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function owner(id) {
  return clean(id.split("@")[0]) === clean(OWNER_NUMBER);
}

async function start() {
  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  if (!state.creds.registered && BOT_NUMBER) {
    await new Promise(r => setTimeout(r, 3000));

    try {
      const code = await sock.requestPairingCode(clean(BOT_NUMBER));

      console.log("");
      console.log("================================");
      console.log("      SPOPO BOT");
      console.log("   PAIRING CODE:");
      console.log("      " + code);
      console.log("================================");
      console.log("");
    } catch (e) {
      console.log("PAIRING ERROR:", e.message);
    }
  }

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ SPOPO BOT CONNECTED");
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        console.log("🔄 إعادة الاتصال...");
        setTimeout(start, 3000);
      } else {
        console.log("❌ تم تسجيل الخروج.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];

    if (!msg || msg.key.fromMe || !msg.message) return;

    const jid = msg.key.remoteJid;
    const body = text(msg).trim();

    if (!body.startsWith(PREFIX)) return;

    const parts = body
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;
    const from = sender(msg);

    const u = user(from, msg.pushName || "");
    if (isGroup(jid)) group(jid);

    u.xp += 10;
    u.level = Math.floor(u.xp / 1000) + 1;

    save();

    const reply = async t =>
      sock.sendMessage(jid, { text: t }, { quoted: msg });

    /* ================= MENU ================= */

    if (["menu","مساعدة","الاوامر","أوامر"].includes(cmd)) {
      return reply(`╭━━━〔 👑 SPOPO BOT 〕━━━╮
┃
┃ 👥 الإدارة
┃ .منشن
┃ .طرد
┃ .ترقية
┃ .تنزيل
┃ .تحذير
┃ .تحذيرات
┃ .قفل
┃ .فتح
┃ .رابط
┃ .المشرفين
┃
┃ 💰 الاقتصاد
┃ .رصيدي
┃ .يومي
┃ .عمل
┃ .تحويل
┃ .متجر
┃ .شراء
┃ .توب
┃
┃ 🏆 الرتب
┃ .رتبتي
┃ .رتب
┃ .لفل
┃ .xp
┃
┃ 🎮 الألعاب
┃ .نرد
┃ .عملة
┃ .حظ
┃ .تخمين
┃ .اختيار
┃
┃ 😂 الترفيه
┃ .نكتة
┃ .حكمة
┃ .اقتباس
┃ .حب
┃ .صداقة
┃
┃ ⚙️ أخرى
┃ .بوت
┃ .بينغ
┃ .ايدي
┃ .وقت
┃ .بروفايل
┃ .احصائيات
┃
╰━━━━━━━━━━━━━━━━━━╯`);
    }

    /* ================= BASIC ================= */

    if (cmd === "بوت")
      return reply("👑 SPOPO BOT\n🔥 Group Management + Economy + XP");

    if (cmd === "بينغ" || cmd === "ping")
      return reply("🏓 Pong!\n✅ البوت خدام.");

    if (cmd === "ايدي" || cmd === "id")
      return reply("🆔 ID:\n" + from);

    if (cmd === "وقت")
      return reply("🕒 " + new Date().toLocaleString("ar-MA"));

    if (cmd === "بروفايل" || cmd === "ملفي") {
      return reply(`👤 ${u.name}

👑 الرتبة: ${u.rank}
⭐ المستوى: ${u.level}
✨ XP: ${u.xp}
💰 العملات: ${money(u.coins)}
⚠️ التحذيرات: ${u.warns}`);
    }

    /* ================= ECONOMY ================= */

    if (cmd === "رصيدي" || cmd === "فلوسي")
      return reply(`💰 رصيدك: ${money(u.coins)} عملة`);

    if (cmd === "يومي") {
      const now = Date.now();

      if (u.lastDaily && now - u.lastDaily < 86400000)
        return reply("⏳ خذ اليومية من بعد.");

      const reward = 1000 + Math.floor(Math.random() * 2000);

      u.coins += reward;
      u.lastDaily = now;

      save();

      return reply(`🎁 اليومية ديالك:\n+${money(reward)} 💰`);
    }

    if (cmd === "عمل") {
      const reward = 200 + Math.floor(Math.random() * 800);
      u.coins += reward;

      save();

      return reply(`💼 خدمتي وربحتي ${money(reward)} 💰`);
    }

    if (cmd === "تحويل") {
      const t = target(msg);
      const amount = Number(args[0]);

      if (!t || !amount || amount < 1)
        return reply("⚠️ استعمل:\n.تحويل @العضو 500");

      if (amount > u.coins)
        return reply("❌ ماعندكش العملات الكافية.");

      user(t).coins += amount;
      u.coins -= amount;

      save();

      return reply(`✅ تم تحويل ${money(amount)} 💰`);
    }

    if (cmd === "توب" || cmd === "توب_فلوس") {
      const list = Object.entries(db.users)
        .sort((a,b) => b[1].coins - a[1].coins)
        .slice(0,10);

      let out = "🏆 TOP 10\n\n";

      list.forEach((x,i) => {
        out += `${i + 1}. ${x[1].name} — ${money(x[1].coins)} 💰\n`;
      });

      return reply(out);
    }

    /* ================= STORE ================= */

    if (cmd === "متجر") {
      return reply(`🛒 متجر SPOPO

1️⃣ VIP — 5000 💰
2️⃣ +5000 XP — 7000 💰
3️⃣ رتبة مميز — 10000 💰
4️⃣ رتبة مشرف — 20000 💰

استعمل:
.شراء 1`);
    }

    if (cmd === "شراء") {
      const id = args[0];

      const items = {
        "1": ["VIP",5000],
        "2": ["5000 XP",7000],
        "3": ["مميز",10000],
        "4": ["مشرف",20000]
      };

      const item = items[id];

      if (!item)
        return reply("❌ المنتج غير موجود.");

      if (u.coins < item[1])
        return reply("❌ العملات ديالك ماكافياش.");

      u.coins -= item[1];

      if (id === "2") {
        u.xp += 5000;
        u.level = Math.floor(u.xp / 1000) + 1;
      }

      if (id === "3") u.rank = "مميز";
      if (id === "4") u.rank = "مشرف";

      save();

      return reply(`✅ شريتي: ${item[0]}`);
    }

    /* ================= RANKS ================= */

    if (cmd === "رتب") {
      return reply(`👑 رتب SPOPO

مواطن
⬇️
مميز
⬇️
مشرف
⬇️
نائب
⬇️
رئيس
⬇️
ملاك`);
    }

    if (cmd === "رتبتي") {
      return reply(`👑 رتبتك: ${u.rank}
⭐ Level: ${u.level}
✨ XP: ${u.xp}`);
    }

    if (cmd === "لفل" || cmd === "مستوى")
      return reply(`⭐ Level: ${u.level}\n✨ XP: ${u.xp}`);

    if (cmd === "xp" || cmd === "خبرة")
      return reply(`✨ XP ديالك: ${u.xp}`);

    /* ================= GAMES ================= */

    if (cmd === "نرد")
      return reply("🎲 النتيجة: " + (1 + Math.floor(Math.random()*6)));

    if (cmd === "عملة")
      return reply("🪙 " + (Math.random() < .5 ? "وجه" : "كتابة"));

    if (cmd === "حظ")
      return reply("🍀 حظك اليوم: " + Math.floor(Math.random()*101) + "%");

    if (cmd === "حب")
      return reply("❤️ نسبة الحب: " + Math.floor(Math.random()*101) + "%");

    if (cmd === "صداقة")
      return reply("🤝 نسبة الصداقة: " + Math.floor(Math.random()*101) + "%");

    if (cmd === "تخمين") {
      const secret = 1 + Math.floor(Math.random()*10);
      const guess = Number(args[0]);

      return reply(
        guess === secret
          ? `🎯 صحيح! الرقم هو ${secret}`
          : `❌ غلط! الرقم كان ${secret}`
      );
    }

    if (cmd === "اختيار") {
      const choices = args.join(" ")
        .split("|")
        .map(x => x.trim())
        .filter(Boolean);

      if (!choices.length)
        return reply("مثال:\n.اختيار بيتزا | برغر | تاكوس");

      return reply(
        "🎯 الاختيار:\n" +
        choices[Math.floor(Math.random()*choices.length)]
      );
    }

    /* ================= FUN ================= */

    if (cmd === "نكتة")
      return reply("😂 واحد مشى للطبيب قال ليه: دكتور كننسى بزاف. قال ليه الطبيب: من إمتى؟ قال ليه: شنو؟");

    if (cmd === "حكمة")
      return reply("🧠 اللي كيزرع الخير كيلقى الخير.");

    if (cmd === "اقتباس")
      return reply("✨ النجاح كيبدأ بخطوة صغيرة كل نهار.");

    /* ================= GROUP ================= */

    if (!isGroup(jid) &&
      ["طرد","ترقية","تنزيل","قفل","فتح","منشن","تحذير","رابط"].includes(cmd)) {
      return reply("❌ هاد الأمر خاصو يكون فالمجموعة.");
    }

    if (["طرد","ترقية","تنزيل","قفل","فتح","منشن","تحذير"].includes(cmd)) {

      const meta = await sock.groupMetadata(jid);

      const me = meta.participants.find(
        p => p.id === from
      );

      if (!me?.admin)
        return reply("❌ خاصك تكون مشرف.");

      if (!meta.participants.some(
        p => p.id === sock.user.id.split(":")[0] + "@s.whatsapp.net" &&
        p.admin
      ))
        return reply("❌ خاص البوت يكون مشرف.");

      const t = target(msg);

      if (cmd === "طرد") {
        if (!t) return reply("⚠️ منشن العضو أو رد على رسالتو.");
        await sock.groupParticipantsUpdate(jid,[t],"remove");
        return reply("✅ تم الطرد.");
      }

      if (cmd === "ترقية") {
        if (!t) return reply("⚠️ منشن العضو.");
        await sock.groupParticipantsUpdate(jid,[t],"promote");
        return reply("👑 تمت الترقية.");
      }

      if (cmd === "تنزيل") {
        if (!t) return reply("⚠️ منشن العضو.");
        await sock.groupParticipantsUpdate(jid,[t],"demote");
        return reply("⬇️ تم التنزيل.");
      }

      if (cmd === "قفل") {
        await sock.groupSettingUpdate(jid,"announcement");
        return reply("🔒 المجموعة تقفلات.");
      }

      if (cmd === "فتح") {
        await sock.groupSettingUpdate(jid,"not_announcement");
        return reply("🔓 المجموعة تحلات.");
      }

      if (cmd === "منشن") {
        const mentions = meta.participants.map(p => p.id);

        return sock.sendMessage(
          jid,
          {
            text: args.join(" ") || "📢 منشن للجميع",
            mentions
          },
          { quoted: msg }
        );
      }

      if (cmd === "تحذير") {
        if (!t) return reply("⚠️ منشن العضو.");

        const tu = user(t);
        tu.warns++;

        save();

        return reply(
          `⚠️ تحذير للعضو\nالتحذيرات: ${tu.warns}/3`
        );
      }
    }

    if (cmd === "تحذيرات") {
      const t = target(msg) || from;
      return reply(`⚠️ التحذيرات: ${user(t).warns}`);
    }

    if (cmd === "المشرفين") {
      if (!isGroup(jid)) return reply("❌ هاد الأمر للمجموعة.");

      const meta = await sock.groupMetadata(jid);

      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => "👑 @" + p.id.split("@")[0]);

      return sock.sendMessage(
        jid,
        {
          text: "🛡️ المشرفين:\n\n" + admins.join("\n"),
          mentions: meta.participants
            .filter(p => p.admin)
            .map(p => p.id)
        },
        { quoted: msg }
      );
    }

    if (cmd === "رابط") {
      if (!isGroup(jid)) return reply("❌ للمجموعات فقط.");

      const meta = await sock.groupMetadata(jid);

      const me = meta.participants.find(
        p => p.id === from
      );

      if (!me?.admin)
        return reply("❌ خاصك تكون مشرف.");

      try {
        const code = await sock.groupInviteCode(jid);
        return reply(
          "🔗 رابط المجموعة:\nhttps://chat.whatsapp.com/" + code
        );
      } catch {
        return reply("❌ ماقدرتش نجيب الرابط.");
      }
    }

    /* ================= OWNER ================= */

    if (cmd === "إحصائيات_البوت" || cmd === "احصائيات") {
      if (!owner(from))
        return reply("❌ المالك فقط.");

      return reply(`🤖 SPOPO BOT

👤 المستخدمين: ${Object.keys(db.users).length}
👥 المجموعات: ${Object.keys(db.groups).length}
⏱️ التشغيل: ${Math.floor(process.uptime())} ثانية`);
    }

    if (cmd === "تعيين_رتبة") {
      if (!owner(from))
        return reply("❌ المالك فقط.");

      const t = target(msg);
      const rank = args[0];

      if (!t || !rank)
        return reply(".تعيين_رتبة @عضو مميز");

      user(t).rank = rank;
      save();

      return reply(`👑 تم تعيين الرتبة: ${rank}`);
    }

    if (cmd === "وقت_التشغيل")
      return reply("⏱️ " + Math.floor(process.uptime()) + " ثانية");

  });
}

process.on("uncaughtException", e =>
  console.log("ERROR:", e.message)
);

process.on("unhandledRejection", e =>
  console.log("ERROR:", e.message)
);

start();
