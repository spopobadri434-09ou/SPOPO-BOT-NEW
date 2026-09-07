import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import P from "pino";
import http from "http";
import fs from "fs";


/* =========================================================
   SPOPO BOT
   ECONOMY + SHOP + GROUP SECURITY + RANKS
   PAIRING CODE ONLY - NO QR
   ========================================================= */


/* =========================
   SETTINGS
   ========================= */

const PREFIX = ".";
const BOT_NUMBER = "212690948777";

const PORT = process.env.PORT || 3000;

const DATA_FILE = "./data.json";
const SESSION_FOLDER = "./session";

const PAIRING_TIME = 5 * 60 * 1000;
const RETRY_TIME = 5 * 60 * 1000;


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


/* =========================
   SHOP
   ========================= */

const SHOP = {
  vip: {
    name: "⭐ رتبة مميز",
    price: 500,
    type: "rank",
    rank: "vip"
  },

  shield: {
    name: "🛡️ درع حماية",
    price: 300,
    type: "item"
  },

  diamond: {
    name: "💎 ألماسة",
    price: 1000,
    type: "item"
  },

  gold: {
    name: "🥇 ذهب",
    price: 750,
    type: "item"
  }
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let sock = null;

let connected = false;

let pairingCode = null;
let codeCreatedAt = 0;

let status = "starting";
let message = "جاري تشغيل SPOPO BOT...";

let pairingRequested = false;
let starting = false;

let retryTimer = null;
let pairingTimer = null;

let socketIdCounter = 0;
let currentSocketId = 0;


/* =========================================================
   DATA
   ========================================================= */

let data = {
  users: {},
  groups: {}
};


function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.log(
      "DATA SAVE ERROR:",
      error?.message || error
    );
  }
}


function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveData();
      return;
    }

    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    if (!raw.trim()) {
      saveData();
      return;
    }

    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object") {
      data = {
        users: parsed.users || {},
        groups: parsed.groups || {}
      };
    }

  } catch (error) {

    console.log(
      "DATA LOAD ERROR:",
      error?.message || error
    );

  }
}


loadData();


/* =========================================================
   USER DATA
   ========================================================= */

function getUser(jid) {

  if (!data.users[jid]) {

    data.users[jid] = {
      money: 1000,
      inventory: {},
      warnings: 0,
      rank: "citizen",
      lastDaily: 0
    };

    saveData();
  }

  return data.users[jid];
}


function getRank(jid) {

  const user = getUser(jid);

  if (jid === `${BOT_NUMBER}@s.whatsapp.net`) {
    return "owner";
  }

  return user.rank || "citizen";
}


function rankName(jid) {

  const rank = getRank(jid);

  return RANKS[rank]?.name || "مواطن";
}


function rankLevel(jid) {

  const rank = getRank(jid);

  return RANKS[rank]?.level || 1;
}


function setRank(jid, rank) {

  if (!RANKS[rank]) {
    return false;
  }

  const user = getUser(jid);

  user.rank = rank;

  saveData();

  return true;
}


/* =========================================================
   GROUP DATA
   ========================================================= */

function getGroup(jid) {

  if (!data.groups[jid]) {

    data.groups[jid] = {
      antiLink: false,
      antiSpam: false,
      protection: true
    };

    saveData();
  }

  return data.groups[jid];
}


/* =========================================================
   JID HELPERS
   ========================================================= */

function normalizeJid(value) {

  if (!value) {
    return null;
  }

  if (
    value.includes("@s.whatsapp.net") ||
    value.includes("@g.us")
  ) {
    return value;
  }

  const clean =
    value
      .replace(/[^\d]/g, "");

  if (!clean) {
    return null;
  }

  return `${clean}@s.whatsapp.net`;
}


function getMentionedJid(msg) {

  const context =
    msg.message?.extendedTextMessage?.contextInfo;

  const mentioned =
    context?.mentionedJid;

  if (
    mentioned &&
    mentioned.length > 0
  ) {
    return mentioned[0];
  }

  return null;
}


function getTargetJid(msg, args) {

  const mentioned =
    getMentionedJid(msg);

  if (mentioned) {
    return mentioned;
  }

  const number =
    args?.[0];

  if (!number) {
    return null;
  }

  return normalizeJid(number);
}


/* =========================================================
   GROUP / ADMIN HELPERS
   ========================================================= */

async function getGroupMetadata(jid) {

  try {
    return await sock.groupMetadata(jid);
  } catch {
    return null;
  }

}


function isGroup(jid) {

  return jid?.endsWith("@g.us");
}


function isAdmin(metadata, jid) {

  if (!metadata) {
    return false;
  }

  const participant =
    metadata.participants?.find(
      p => p.id === jid
    );

  if (!participant) {
    return false;
  }

  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin"
  );
}


function isBotAdmin(metadata) {

  if (!sock?.user?.id) {
    return false;
  }

  return isAdmin(
    metadata,
    sock.user.id
  );
}


function isOwner(jid) {

  return jid ===
    `${BOT_NUMBER}@s.whatsapp.net`;
}


function canManageGroup(jid, metadata) {

  return (
    isOwner(jid) ||
    rankLevel(jid) >= 3 ||
    isAdmin(metadata, jid)
  );
}


function canUseRankCommand(jid, metadata) {

  return (
    isOwner(jid) ||
    isAdmin(metadata, jid) ||
    rankLevel(jid) >= 4
  );
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendText(jid, text, mentions = []) {

  if (!sock) {
    return;
  }

  try {

    await sock.sendMessage(
      jid,
      {
        text,
        mentions
      }
    );

  } catch (error) {

    console.log(
      "SEND ERROR:",
      error?.message || error
    );

  }
}


/* =========================================================
   COMMAND PARSER
   ========================================================= */

function getText(msg) {

  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  ).trim();

}


function parseCommand(text) {

  if (!text.startsWith(PREFIX)) {
    return null;
  }

  const withoutPrefix =
    text.slice(PREFIX.length).trim();

  if (!withoutPrefix) {
    return null;
  }

  const parts =
    withoutPrefix.split(/\s+/);

  const command =
    parts.shift().toLowerCase();

  return {
    command,
    args: parts
  };
}


/* =========================================================
   MENU
   ========================================================= */

function mainMenu() {

  return `
🤖 *SPOPO BOT*

╭━━━〔 🛒 المتجر والاقتصاد 〕━━━╮
┃
┃ 💰 .رصيد
┃ 🎁 .يومي
┃ 💸 .تحويل
┃ 🛒 .متجر
┃ 🛍️ .شراء
┃ 🎒 .حقيبتي
┃ 🏆 .الأغنياء
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👑 الرتب 〕━━━╮
┃
┃ 👤 .رتبتي
┃ 👥 .الرتب
┃ ⬆️ .ترقية
┃ ⬇️ .تنزيل
┃
╰━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🛡️ أمن المجموعة 〕━━━╮
┃
┃ 🚫 .منع_الروابط
┃ 🔓 .فتح_الروابط
┃ 🛡️ .حماية
┃ 🔓 .تعطيل_الحماية
┃ 🚨 .تحذير
┃ 📋 .تحذيرات
┃ 🧹 .مسح
┃ 👢 .طرد
┃ ➕ .اضف
┃ 🔒 .قفل
┃ 🔓 .فتح
┃ 👥 .منشن
┃
╰━━━━━━━━━━━━━━━━━━╯

⚡ Prefix: .
`;
}


/* =========================================================
   SHOP MENU
   ========================================================= */

function shopMenu() {

  let text =
    "🛒 *متجر SPOPO BOT*\n\n";

  for (
    const [id, item] of Object.entries(SHOP)
  ) {

    text +=
      `🆔 ${id}\n` +
      `📦 ${item.name}\n` +
      `💰 السعر: ${item.price}\n\n`;
  }

  text +=
    "🛍️ للشراء:\n" +
    "`.شراء اسم_المنتج`\n\n" +
    "مثال:\n" +
    "`.شراء vip`";

  return text;
}


/* =========================================================
   DAILY
   ========================================================= */

async function dailyCommand(jid) {

  const user =
    getUser(jid);

  const now =
    Date.now();

  const DAY =
    24 * 60 * 60 * 1000;

  if (
    now - user.lastDaily < DAY
  ) {

    const remaining =
      DAY -
      (now - user.lastDaily);

    const hours =
      Math.ceil(
        remaining / (60 * 60 * 1000)
      );

    await sendText(
      jid,
      `⏳ خديتي الهدية اليومية ديالك.\nرجع من بعد حوالي ${hours} ساعة.`
    );

    return;
  }

  const reward =
    250 +
    Math.floor(
      Math.random() * 251
    );

  user.money += reward;

  user.lastDaily =
    now;

  saveData();

  await sendText(
    jid,
    `🎁 *الهدية اليومية*\n\n💰 ربحت: ${reward}\n💵 رصيدك: ${user.money}`
  );
}


/* =========================================================
   BALANCE
   ========================================================= */

async function balanceCommand(jid) {

  const user =
    getUser(jid);

  await sendText(
    jid,
    `💰 *الرصيد*\n\n👤 الرتبة: ${rankName(jid)}\n💵 فلوسك: ${user.money}`
  );
}


/* =========================================================
   INVENTORY
   ========================================================= */

async function inventoryCommand(jid) {

  const user =
    getUser(jid);

  const inventory =
    user.inventory || {};

  const entries =
    Object.entries(inventory);

  if (entries.length === 0) {

    await sendText(
      jid,
      "🎒 الحقيبة ديالك خاوية."
    );

    return;
  }

  let text =
    "🎒 *حقيبتي*\n\n";

  for (
    const [item, amount] of entries
  ) {

    text +=
      `📦 ${item}: ${amount}\n`;
  }

  await sendText(
    jid,
    text
  );
}


/* =========================================================
   BUY
   ========================================================= */

async function buyCommand(jid, args) {

  const itemId =
    args?.[0]?.toLowerCase();

  if (!itemId) {

    await sendText(
      jid,
      "❌ كتب اسم المنتج.\nمثال: `.شراء vip`"
    );

    return;
  }

  const item =
    SHOP[itemId];

  if (!item) {

    await sendText(
      jid,
      "❌ هاد المنتج ما كاينش فالمتجر.\nاستعمل `.متجر`"
    );

    return;
  }

  const user =
    getUser(jid);

  if (user.money < item.price) {

    await sendText(
      jid,
      `❌ ما عندكش فلوس كافية.\n\n💰 الثمن: ${item.price}\n💵 رصيدك: ${user.money}`
    );

    return;
  }


  /*
    VIP
  */

  if (item.type === "rank") {

    if (
      rankLevel(jid) >=
      RANKS[item.rank].level
    ) {

      await sendText(
        jid,
        "❌ عندك هاد الرتبة أو أعلى منها."
      );

      return;
    }

    user.money -=
      item.price;

    user.rank =
      item.rank;

    saveData();

    await sendText(
      jid,
      `🎉 مبروك!\n\n👑 حصلتي على رتبة *${RANKS[item.rank].name}*\n💸 صرفتي: ${item.price}\n💰 الباقي: ${user.money}`
    );

    return;
  }


  /*
    NORMAL ITEM
  */

  user.money -=
    item.price;

  if (!user.inventory[itemId]) {
    user.inventory[itemId] = 0;
  }

  user.inventory[itemId]++;

  saveData();

  await sendText(
    jid,
    `✅ تم الشراء!\n\n📦 ${item.name}\n💸 الثمن: ${item.price}\n💰 الباقي: ${user.money}`
  );
}


/* =========================================================
   TRANSFER
   ========================================================= */

async function transferCommand(
  jid,
  msg,
  args
) {

  const target =
    getTargetJid(
      msg,
      args
    );

  const amount =
    Number(
      args?.[1]
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن الشخص.\nمثال: `.تحويل @user 500`"
    );

    return;
  }

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {

    await sendText(
      jid,
      "❌ المبلغ خاصو يكون رقم صحيح."
    );

    return;
  }

  if (target === jid) {

    await sendText(
      jid,
      "❌ ما تقدرش تحول لنفسك."
    );

    return;
  }

  const sender =
    getUser(jid);

  if (
    sender.money < amount
  ) {

    await sendText(
      jid,
      "❌ رصيدك ما كافيش."
    );

    return;
  }

  const receiver =
    getUser(target);

  sender.money -=
    amount;

  receiver.money +=
    amount;

  saveData();

  await sendText(
    jid,
    `💸 *تم التحويل*\n\n👤 إلى: @${target.split("@")[0]}\n💰 المبلغ: ${amount}\n💵 رصيدك: ${sender.money}`,
    [target]
  );
}


/* =========================================================
   RICH LIST
   ========================================================= */

async function richList(jid) {

  const users =
    Object.entries(data.users)
      .sort(
        (a, b) =>
          (b[1].money || 0) -
          (a[1].money || 0)
      )
      .slice(0, 10);

  if (!users.length) {

    await sendText(
      jid,
      "📊 مازال ما كاين حتى ترتيب."
    );

    return;
  }

  let text =
    "🏆 *أغنى 10 أعضاء*\n\n";

  users.forEach(
    ([id, user], index) => {

      text +=
        `${index + 1}. @${id.split("@")[0]} — 💰 ${user.money || 0}\n`;
    }
  );

  await sendText(
    jid,
    text,
    users.map(
      ([id]) => id
    )
  );
}


/* =========================================================
   MY RANK
   ========================================================= */

async function myRank(jid) {

  await sendText(
    jid,
    `👑 *رتبتك*\n\n🏷️ ${rankName(jid)}\n📊 المستوى: ${rankLevel(jid)}`
  );
}


/* =========================================================
   RANK LIST
   ========================================================= */

async function rankList(jid) {

  let text =
    "👑 *رتب SPOPO BOT*\n\n";

  for (
    const [id, rank] of Object.entries(RANKS)
  ) {

    text +=
      `${rank.level}. ${rank.name}\n`;
  }

  await sendText(
    jid,
    text
  );
}


/* =========================================================
   CHANGE RANK
   ========================================================= */

async function changeRank(
  jid,
  msg,
  args,
  direction,
  metadata
) {

  if (
    !canUseRankCommand(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية لهاد الأمر."
    );

    return;
  }


  const target =
    getTargetJid(
      msg,
      args
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن العضو."
    );

    return;
  }

  if (target === jid) {

    await sendText(
      jid,
      "❌ ما تقدرش تبدل رتبتك بهاد الأمر."
    );

    return;
  }


  const current =
    getRank(target);

  const currentLevel =
    RANKS[current]?.level || 1;


  let newLevel;

  if (
    direction === "up"
  ) {
    newLevel =
      currentLevel + 1;
  } else {
    newLevel =
      currentLevel - 1;
  }


  /*
    Owner cannot be changed
  */

  if (
    current === "owner"
  ) {

    await sendText(
      jid,
      "❌ رتبة ملاك ما يمكنش تتبدل."
    );

    return;
  }


  if (
    newLevel < 1 ||
    newLevel > 5
  ) {

    await sendText(
      jid,
      direction === "up"
        ? "❌ وصل لأعلى رتبة قابلة للترقية."
        : "❌ وصل لأدنى رتبة."
    );

    return;
  }


  /*
    لا يمكن إعطاء رتبة مساوية أو أعلى
    من رتبة المنفذ
  */

  if (
    newLevel >=
    rankLevel(jid)
  ) {

    await sendText(
      jid,
      "❌ ما تقدرش تعطي رتبة مساوية أو أعلى من رتبتك."
    );

    return;
  }


  const newRank =
    Object.keys(RANKS)
      .find(
        key =>
          RANKS[key].level ===
          newLevel
      );


  setRank(
    target,
    newRank
  );


  await sendText(
    jid,
    direction === "up"
      ? `⬆️ تمت ترقية @${target.split("@")[0]} إلى *${RANKS[newRank].name}*`
      : `⬇️ تم تنزيل @${target.split("@")[0]} إلى *${RANKS[newRank].name}*`,
    [target]
  );
}


/* =========================================================
   WARN
   ========================================================= */

async function warnCommand(
  jid,
  msg,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش صلاحية التحذير."
    );

    return;
  }


  const target =
    getTargetJid(
      msg,
      args
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن العضو."
    );

    return;
  }


  if (
    isAdmin(
      metadata,
      target
    )
  ) {

    await sendText(
      jid,
      "❌ ما يمكنش تحذر مشرف المجموعة."
    );

    return;
  }


  const user =
    getUser(target);

  user.warnings++;

  saveData();


  if (
    user.warnings >= 3
  ) {

    user.warnings = 0;

    saveData();


    if (
      isBotAdmin(metadata)
    ) {

      try {

        await sock.groupParticipantsUpdate(
          jid,
          [target],
          "remove"
        );

        await sendText(
          jid,
          `🚨 @${target.split("@")[0]} وصل لـ3 تحذيرات وتمت إزالته من المجموعة.`,
          [target]
        );

      } catch {

        await sendText(
          jid,
          "❌ ما قدرتش نحيد العضو. تأكد أن البوت مشرف."
        );
      }

    } else {

      await sendText(
        jid,
        `⚠️ @${target.split("@")[0]} وصل لـ3 تحذيرات، ولكن البوت ماشي مشرف باش يحيدو.`,
        [target]
      );

    }

    return;
  }


  await sendText(
    jid,
    `⚠️ تم تحذير @${target.split("@")[0]}\n\n🚨 التحذيرات: ${user.warnings}/3`,
    [target]
  );
}


/* =========================================================
   WARNINGS
   ========================================================= */

async function warningsCommand(
  jid,
  msg,
  args
) {

  const target =
    getTargetJid(
      msg,
      args
    ) || jid;

  const user =
    getUser(target);

  await sendText(
    jid,
    `⚠️ التحذيرات ديال @${target.split("@")[0]}: ${user.warnings}/3`,
    [target]
  );
}


/* =========================================================
   KICK
   ========================================================= */

async function kickCommand(
  jid,
  msg,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش صلاحية الطرد."
    );

    return;
  }


  if (!isBotAdmin(metadata)) {

    await sendText(
      jid,
      "❌ خاص البوت يكون مشرف."
    );

    return;
  }


  const target =
    getTargetJid(
      msg,
      args
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن العضو اللي بغيتي تطرد."
    );

    return;
  }


  if (
    isAdmin(
      metadata,
      target
    )
  ) {

    await sendText(
      jid,
      "❌ ما يمكنش طرد مشرف."
    );

    return;
  }


  if (
    isOwner(target)
  ) {

    await sendText(
      jid,
      "❌ ما يمكنش طرد مالك البوت."
    );

    return;
  }


  try {

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "remove"
    );

    await sendText(
      jid,
      `👢 تم طرد @${target.split("@")[0]}`,
      [target]
    );

  } catch {

    await sendText(
      jid,
      "❌ فشل الطرد."
    );

  }
}


/* =========================================================
   ADD
   ========================================================= */

async function addCommand(
  jid,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  if (!isBotAdmin(metadata)) {

    await sendText(
      jid,
      "❌ خاص البوت يكون مشرف."
    );

    return;
  }


  const target =
    normalizeJid(
      args?.[0]
    );

  if (!target) {

    await sendText(
      jid,
      "❌ كتب رقم العضو.\nمثال: `.اضف 2126xxxxxxx`"
    );

    return;
  }


  try {

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "add"
    );

    await sendText(
      jid,
      `➕ تمت محاولة إضافة @${target.split("@")[0]}`,
      [target]
    );

  } catch {

    await sendText(
      jid,
      "❌ ما قدرتش نضيف الرقم."
    );

  }
}


/* =========================================================
   PROMOTE
   ========================================================= */

async function promoteCommand(
  jid,
  msg,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  if (!isBotAdmin(metadata)) {

    await sendText(
      jid,
      "❌ خاص البوت يكون مشرف."
    );

    return;
  }


  const target =
    getTargetJid(
      msg,
      args
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن العضو."
    );

    return;
  }


  try {

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "promote"
    );

    await sendText(
      jid,
      `⬆️ تمت ترقية @${target.split("@")[0]} إلى مشرف WhatsApp.`,
      [target]
    );

  } catch {

    await sendText(
      jid,
      "❌ فشلت الترقية."
    );

  }
}


/* =========================================================
   DEMOTE
   ========================================================= */

async function demoteCommand(
  jid,
  msg,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  if (!isBotAdmin(metadata)) {

    await sendText(
      jid,
      "❌ خاص البوت يكون مشرف."
    );

    return;
  }


  const target =
    getTargetJid(
      msg,
      args
    );

  if (!target) {

    await sendText(
      jid,
      "❌ منشن العضو."
    );

    return;
  }


  try {

    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "demote"
    );

    await sendText(
      jid,
      `⬇️ تم تنزيل @${target.split("@")[0]} من مشرف.`,
      [target]
    );

  } catch {

    await sendText(
      jid,
      "❌ فشل التنزيل."
    );

  }
}


/* =========================================================
   GROUP LOCK / OPEN
   ========================================================= */

async function groupSettingCommand(
  jid,
  command,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  if (!isBotAdmin(metadata)) {

    await sendText(
      jid,
      "❌ خاص البوت يكون مشرف."
    );

    return;
  }


  try {

    if (command === "قفل") {

      await sock.groupSettingUpdate(
        jid,
        "announcement"
      );

      await sendText(
        jid,
        "🔒 تم قفل المجموعة. غير المشرفين يقدرو يرسلو."
      );

    } else {

      await sock.groupSettingUpdate(
        jid,
        "not_announcement"
      );

      await sendText(
        jid,
        "🔓 تم فتح المجموعة."
      );

    }

  } catch {

    await sendText(
      jid,
      "❌ ما قدرتش نبدل إعدادات المجموعة."
    );

  }
}


/* =========================================================
   ANTI LINK
   ========================================================= */

async function antiLinkCommand(
  jid,
  command,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  const group =
    getGroup(jid);


  if (
    command === "منع_الروابط"
  ) {

    group.antiLink = true;

    saveData();

    await sendText(
      jid,
      "🛡️ تم تشغيل منع الروابط."
    );

  } else {

    group.antiLink = false;

    saveData();

    await sendText(
      jid,
      "🔓 تم تعطيل منع الروابط."
    );
  }
}


/* =========================================================
   PROTECTION
   ========================================================= */

async function protectionCommand(
  jid,
  command,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  const group =
    getGroup(jid);


  if (
    command === "حماية"
  ) {

    group.protection = true;

    saveData();

    await sendText(
      jid,
      "🛡️ حماية المجموعة مفعلة."
    );

  } else {

    group.protection = false;

    saveData();

    await sendText(
      jid,
      "🔓 تم تعطيل حماية المجموعة."
    );
  }
}


/* =========================================================
   CLEAR
   ========================================================= */

async function clearCommand(
  jid,
  msg,
  args,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  /*
    WhatsApp ما كيسمحش للبوت
    بمسح عدد كبير من رسائل الآخرين
    باستعمال أمر واحد بشكل مضمون.
  */

  const key =
    msg.key;


  try {

    await sock.sendMessage(
      jid,
      {
        delete: key
      }
    );

    await sendText(
      jid,
      "🧹 تمت محاولة حذف الرسالة."

    );

  } catch {

    await sendText(
      jid,
      "❌ ما قدرتش نحذف الرسالة."
    );
  }
}


/* =========================================================
   MENTION ALL
   ========================================================= */

async function mentionAll(
  jid,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  const participants =
    metadata.participants || [];


  if (
    participants.length === 0
  ) {
    return;
  }


  const mentions =
    participants.map(
      p => p.id
    );


  let text =
    "📢 *منشن المجموعة*\n\n";


  for (
    const participant of participants
  ) {

    text +=
      `@${participant.id.split("@")[0]} `;
  }


  await sendText(
    jid,
    text,
    mentions
  );
}


/* =========================================================
   GROUP SECURITY STATUS
   ========================================================= */

async function securityStatus(
  jid,
  metadata
) {

  if (
    !canManageGroup(
      jid,
      metadata
    )
  ) {

    await sendText(
      jid,
      "❌ ما عندكش الصلاحية."
    );

    return;
  }


  const group =
    getGroup(jid);


  await sendText(
    jid,
    `🛡️ *حالة حماية المجموعة*

🔗 منع الروابط: ${
      group.antiLink
        ? "🟢 مفعّل"
        : "🔴 متوقف"
    }

🚨 الحماية العامة: ${
      group.protection
        ? "🟢 مفعّلة"
        : "🔴 متوقفة"
    }`
  );
}


/* =========================================================
   MESSAGE SECURITY
   ========================================================= */

async function checkSecurity(
  msg,
  jid,
  metadata,
  text
) {

  if (!isGroup(jid)) {
    return false;
  }

  const group =
    getGroup(jid);


  /*
    Ignore admins
  */

  const sender =
    msg.key?.participant ||
    msg.key?.remoteJid;


  if (
    isAdmin(
      metadata,
      sender
    )
  ) {
    return false;
  }


  /*
    Anti Link
  */

  if (
    group.antiLink
  ) {

    const linkRegex =
      /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/|discord\.gg\/)/i;


    if (
      linkRegex.test(text)
    ) {

      try {

        if (
          isBotAdmin(metadata)
        ) {

          await sock.sendMessage(
            jid,
            {
              delete: msg.key
            }
          );

          await sendText(
            jid,
            `🚫 ممنوع إرسال الروابط.\n@${sender.split("@")[0]} تم حذف الرسالة.`,
            [sender]
          );

        }

      } catch {

        await sendText(
          jid,
          "🚫 ممنوع إرسال الروابط."
        );
      }


      return true;
    }
  }


  return false;
}


/* =========================================================
   COMMAND HANDLER
   ========================================================= */

async function handleCommand(
  msg,
  jid,
  metadata,
  command,
  args
) {

  const sender =
    msg.key?.participant ||
    msg.key?.remoteJid;


  /*
    MENU
  */

  if (
    ["menu", "اوامر", "الأوامر"].includes(
      command
    )
  ) {

    await sendText(
      jid,
      mainMenu()
    );

    return;
  }


  /*
    PING
  */

  if (
    command === "ping"
  ) {

    await sendText(
      jid,
      "🏓 *Pong!*\n\n🤖 SPOPO BOT خدام."
    );

    return;
  }


  /*
    BALANCE
  */

  if (
    ["رصيد", "فلوسي"].includes(
      command
    )
  ) {

    await balanceCommand(
      sender
    );

    return;
  }


  /*
    DAILY
  */

  if (
    ["يومي", "هدية"].includes(
      command
    )
  ) {

    await dailyCommand(
      sender
    );

    return;
  }


  /*
    SHOP
  */

  if (
    ["متجر", "shop"].includes(
      command
    )
  ) {

    await sendText(
      jid,
      shopMenu()
    );

    return;
  }


  /*
    BUY
  */

  if (
    ["شراء", "buy"].includes(
      command
    )
  ) {

    await buyCommand(
      sender,
      args
    );

    return;
  }


  /*
    INVENTORY
  */

  if (
    ["حقيبتي", "حقيبة"].includes(
      command
    )
  ) {

    await inventoryCommand(
      sender
    );

    return;
  }


  /*
    TRANSFER
  */

  if (
    ["تحويل"].includes(
      command
    )
  ) {

    await transferCommand(
      sender,
      msg,
      args
    );

    return;
  }


  /*
    RICH
  */

  if (
    ["الأغنياء", "ترتيب"].includes(
      command
    )
  ) {

    await richList(
      jid
    );

    return;
  }


  /*
    MY RANK
  */

  if (
    ["رتبتي", "رتب"].includes(
      command
    ) &&
    !isGroup(jid)
  ) {

    await myRank(
      sender
    );

    return;
  }


  if (
    command === "الرتب"
  ) {

    await rankList(
      jid
    );

    return;
  }


  /*
    PROMOTE RANK
  */

  if (
    ["ترقية_رتبة", "ترقية"].includes(
      command
    ) &&
    isGroup(jid)
  ) {

    await changeRank(
      sender,
      msg,
      args,
      "up",
      metadata
    );

    return;
  }


  /*
    DEMOTE RANK
  */

  if (
    ["تنزيل_رتبة", "تنزيل"].includes(
      command
    ) &&
    isGroup(jid)
  ) {

    await changeRank(
      sender,
      msg,
      args,
      "down",
      metadata
    );

    return;
  }


  /*
    GROUP COMMANDS
  */

  if (
    !isGroup(jid)
  ) {

    return;
  }


  /*
    KICK
  */

  if (
    ["طرد", "kick"].includes(
      command
    )
  ) {

    await kickCommand(
      jid,
      msg,
      args,
      metadata
    );

    return;
  }


  /*
    ADD
  */

  if (
    ["اضف", "إضافة", "add"].includes(
      command
    )
  ) {

    await addCommand(
      jid,
      args,
      metadata
    );

    return;
  }


  /*
    PROMOTE WHATSAPP ADMIN
  */

  if (
    ["مشرف", "رفع"].includes(
      command
    )
  ) {

    await promoteCommand(
      jid,
      msg,
      args,
      metadata
    );

    return;
  }


  /*
    DEMOTE WHATSAPP ADMIN
  */

  if (
    ["عزل", "خفض"].includes(
      command
    )
  ) {

    await demoteCommand(
      jid,
      msg,
      args,
      metadata
    );

    return;
  }


  /*
    WARN
  */

  if (
    ["تحذير", "انذار"].includes(
      command
    )
  ) {

    await warnCommand(
      jid,
      msg,
      args,
      metadata
    );

    return;
  }


  /*
    WARNINGS
  */

  if (
    ["تحذيرات"].includes(
      command
    )
  ) {

    await warningsCommand(
      jid,
      msg,
      args
    );

    return;
  }


  /*
    LOCK / OPEN
  */

  if (
    ["قفل", "فتح"].includes(
      command
    )
  ) {

    await groupSettingCommand(
      jid,
      command,
      metadata
    );

    return;
  }


  /*
    ANTI LINK
  */

  if (
    [
      "منع_الروابط",
      "فتح_الروابط"
    ].includes(command)
  ) {

    await antiLinkCommand(
      jid,
      command,
      metadata
    );

    return;
  }


  /*
    PROTECTION
  */

  if (
    [
      "حماية",
      "تعطيل_الحماية"
    ].includes(command)
  ) {

    await protectionCommand(
      jid,
      command,
      metadata
    );

    return;
  }


  /*
    SECURITY STATUS
  */

  if (
    ["حالة_الحماية"].includes(
      command
    )
  ) {

    await securityStatus(
      jid,
      metadata
    );

    return;
  }


  /*
    CLEAR MESSAGE
  */

  if (
    ["مسح", "حذف"].includes(
      command
    )
  ) {

    await clearCommand(
      jid,
      msg,
      args,
      metadata
    );

    return;
  }


  /*
    MENTION ALL
  */

  if (
    ["منشن", "منشن_الكل"].includes(
      command
    )
  ) {

    await mentionAll(
      jid,
      metadata
    );

    return;
  }

}


/* =========================================================
   PAIRING WEBSITE
   ========================================================= */

const server =
  http.createServer(
    (req, res) => {

      if (
        req.url?.startsWith(
          "/api/status"
        )
      ) {

        const now =
          Date.now();

        let expiresIn =
          0;

        if (
          pairingCode &&
          codeCreatedAt
        ) {

          expiresIn =
            Math.max(
              0,
              Math.ceil(
                (
                  PAIRING_TIME -
                  (
                    now -
                    codeCreatedAt
                  )
                ) / 1000
              )
            );
        }


        res.writeHead(
          200,
          {
            "Content-Type":
              "application/json; charset=utf-8",

            "Cache-Control":
              "no-store"
          }
        );


        res.end(
          JSON.stringify({
            connected,
            pairingCode,
            expiresIn,
            status,
            message
          })
        );

        return;
      }


      res.writeHead(
        200,
        {
          "Content-Type":
            "text/html; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      );


      res.end(`
<!DOCTYPE html>

<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
/>

<title>SPOPO BOT</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  background:
    radial-gradient(
      circle at top,
      #24242d,
      #08080b 65%
    );

  color: white;

  font-family:
    Arial,
    Tahoma,
    sans-serif;

  display: flex;

  justify-content: center;

  align-items: center;

  padding: 20px;
}

.box {
  width: 100%;

  max-width: 450px;

  background: #15151c;

  border-radius: 24px;

  padding: 30px 20px;

  text-align: center;

  box-shadow:
    0 20px 70px
    rgba(0,0,0,.55);
}

.logo {
  font-size: 55px;
}

h1 {
  margin: 5px 0;

  font-size: 32px;
}

.sub {
  color: #888;

  font-size: 14px;
}

.phone {
  margin-top: 18px;

  color: #aaa;

  direction: ltr;
}

.status {
  margin-top: 25px;

  padding: 15px;

  border-radius: 14px;

  background: #0e0e13;
}

.code {
  margin-top: 15px;

  min-height: 85px;

  display: flex;

  align-items: center;

  justify-content: center;

  background: #09090c;

  border-radius: 16px;

  font-size: 32px;

  font-weight: bold;

  letter-spacing: 6px;

  direction: ltr;
}

.timer {
  margin-top: 14px;

  color: #aaa;
}

.help {
  margin-top: 25px;

  padding: 15px;

  border-radius: 15px;

  background: #101016;

  color: #aaa;

  line-height: 1.9;

  font-size: 13px;
}

.green {
  color: #35d07f;
}

.yellow {
  color: #f2c94c;
}

.red {
  color: #ff6262;
}

</style>

</head>

<body>

<div class="box">

<div class="logo">
🤖
</div>

<h1>
SPOPO BOT
</h1>

<div class="sub">
WhatsApp Pairing System
</div>

<div class="phone">
+212 644 140 800
</div>

<div
  id="status"
  class="status"
>
⏳ جاري تشغيل البوت...
</div>

<div
  id="code"
  class="code"
>
--------
</div>

<div
  id="timer"
  class="timer"
>
انتظر...
</div>

<div class="help">

📱 افتح WhatsApp

<br>

⚙️ الأجهزة المرتبطة

<br>

➕ ربط جهاز

<br>

🔢 ربط باستخدام رقم الهاتف

<br>

ثم أدخل الكود اللي فوق

</div>

</div>


<script>

async function update() {

  try {

    const response =
      await fetch(
        "/api/status?_=" +
        Date.now()
      );

    const data =
      await response.json();


    const status =
      document.getElementById(
        "status"
      );

    const code =
      document.getElementById(
        "code"
      );

    const timer =
      document.getElementById(
        "timer"
      );


    if (data.connected) {

      status.innerHTML =
        '<span class="green">🟢 WhatsApp متصل بنجاح</span>';

      code.innerText =
        "CONNECTED";

      timer.innerText =
        "✅ تم ربط البوت";

      return;
    }


    if (data.pairingCode) {

      status.innerHTML =
        '<span class="yellow">🟡 في انتظار ربط WhatsApp</span>';

      code.innerText =
        data.pairingCode;


      if (
        data.expiresIn > 0
      ) {

        const minutes =
          Math.floor(
            data.expiresIn / 60
          );

        const seconds =
          data.expiresIn % 60;


        timer.innerText =
          "⏱️ الكود يتجدد بعد " +
          minutes +
          ":" +
          String(seconds)
            .padStart(2, "0");

      }

      return;
    }


    code.innerText =
      "--------";

    timer.innerText =
      data.message ||
      "انتظر...";


    if (
      data.status === "error"
    ) {

      status.innerHTML =
        '<span class="red">🔴 ' +
        (
          data.message ||
          "وقع خطأ"
        ) +
        '</span>';

    } else {

      status.innerText =
        "⏳ " +
        (
          data.message ||
          "جاري التشغيل..."
        );
    }


  } catch {

    document.getElementById(
      "status"
    ).innerHTML =
      '<span class="red">❌ تعذر الاتصال بالسيرفر</span>';

  }

}


update();

setInterval(
  update,
  1000
);

</script>

</body>

</html>
      `);

    }
  );


server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "================================"
    );

    console.log(
      "🌐 SPOPO BOT WEBSITE"
    );

    console.log(
      "📱 +212644140800"
    );

    console.log(
      "🔐 PAIRING CODE ONLY"
    );

    console.log(
      "🚫 NO QR"
    );

    console.log(
      "================================"
    );

    console.log("");

  }
);


/* =========================================================
   TIMER HELPERS
   ========================================================= */

function clearPairingTimer() {

  if (pairingTimer) {

    clearTimeout(
      pairingTimer
    );

    pairingTimer = null;
  }
}


function clearRetryTimer() {

  if (retryTimer) {

    clearTimeout(
      retryTimer
    );

    retryTimer = null;
  }
}


function resetPairing() {

  clearPairingTimer();

  pairingCode = null;

  codeCreatedAt = 0;

  pairingRequested = false;
}


/* =========================================================
   RETRY
   ========================================================= */

function scheduleRetry(
  reason
) {

  if (connected) {
    return;
  }


  clearRetryTimer();


  status =
    "waiting";

  message =
    reason ||
    "غادي نعاود المحاولة بعد 5 دقايق.";


  retryTimer =
    setTimeout(
      async () => {

        retryTimer = null;

        resetPairing();

        await startBot();

      },
      RETRY_TIME
    );
}


/* =========================================================
   GENERATE PAIRING CODE
   ========================================================= */

async function generatePairingCode(
  mySock,
  mySocketId
) {

  if (!mySock) {
    return;
  }


  if (connected) {
    return;
  }


  if (
    pairingRequested
  ) {
    return;
  }


  if (
    mySocketId !==
    currentSocketId
  ) {
    return;
  }


  if (
    mySock.authState?.creds?.registered
  ) {
    return;
  }


  pairingRequested =
    true;


  try {

    /*
      ننتظر socket شوية
    */

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          2000
        )
    );


    if (
      !sock ||
      sock !== mySock ||
      mySocketId !==
        currentSocketId
    ) {

      pairingRequested =
        false;

      return;
    }


    if (connected) {

      pairingRequested =
        false;

      return;
    }


    status =
      "pairing";

    message =
      "جاري إنشاء Pairing Code...";


    console.log("");
    console.log(
      "================================"
    );

    console.log(
      "🔐 REQUESTING PAIRING CODE"
    );

    console.log(
      "📱 " + BOT_NUMBER
    );

    console.log(
      "================================"
    );


    const code =
      await mySock.requestPairingCode(
        BOT_NUMBER
      );


    if (
      mySocketId !==
      currentSocketId
    ) {
      return;
    }


    pairingCode =
      code;

    codeCreatedAt =
      Date.now();


    status =
      "pairing";

    message =
      "دخل الكود في WhatsApp";


    console.log("");
    console.log(
      "================================"
    );

    console.log(
      "🔑 SPOPO PAIRING CODE"
    );

    console.log(
      code
    );

    console.log(
      "================================"
    );

    console.log("");


    /*
      الكود يبقى 5 دقائق
    */

    clearPairingTimer();


    pairingTimer =
      setTimeout(
        async () => {

          pairingTimer = null;


          if (connected) {
            return;
          }


          if (
            mySocketId !==
            currentSocketId
          ) {
            return;
          }


          console.log(
            "⏰ Pairing code expired."
          );


          resetPairing();


          try {

            mySock.ws?.close();

          } catch {}


          sock = null;


          await startBot();

        },
        PAIRING_TIME
      );


  } catch (error) {

    console.log("");
    console.log(
      "❌ PAIRING ERROR:",
      error?.message || error
    );
    console.log("");


    pairingRequested =
      false;


    resetPairing();


    status =
      "error";

    message =
      "فشل إنشاء الكود. غادي نعاود المحاولة بعد 5 دقايق.";


    /*
      مهم:
      ما نعاودوش مباشرة
    */

    scheduleRetry(
      "فشل الاتصال. غادي نعاود المحاولة بعد 5 دقايق."
    );
  }
}


/* =========================================================
   START BOT
   ========================================================= */

async function startBot() {

  if (starting) {
    return;
  }


  if (connected) {
    return;
  }


  starting =
    true;


  clearRetryTimer();


  const mySocketId =
    ++socketIdCounter;


  currentSocketId =
    mySocketId;


  resetPairing();


  status =
    "starting";

  message =
    "جاري تشغيل SPOPO BOT...";


  try {

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        SESSION_FOLDER
      );


    const alreadyRegistered =
      state.creds.registered;


    const newSock =
      makeWASocket({

        auth: state,

        logger:
          P({
            level: "silent"
          }),

        printQRInTerminal:
          false,

        browser: [
          "SPOPO BOT",
          "Chrome",
          "1.0.0"
        ],

        syncFullHistory:
          false

      });


    sock =
      newSock;


    newSock.ev.on(
      "creds.update",
      saveCreds
    );


    newSock.ev.on(
      "connection.update",
      async ({
        connection,
        lastDisconnect
      }) => {

        console.log(
          "Connection:",
          connection
        );


        /* =========================
           CONNECTING
           ========================= */

        if (
          connection ===
          "connecting"
        ) {

          connected =
            false;

          status =
            "connecting";

          message =
            "جاري الاتصال بـ WhatsApp...";


          if (
            !alreadyRegistered &&
            !newSock.authState?.creds?.registered
          ) {

            await generatePairingCode(
              newSock,
              mySocketId
            );
          }


          return;
        }


        /* =========================
           OPEN
           ========================= */

        if (
          connection ===
          "open"
        ) {

          if (
            mySocketId !==
            currentSocketId
          ) {
            return;
          }


          connected =
            true;


          status =
            "connected";

          message =
            "WhatsApp متصل بنجاح";


          clearPairingTimer();

          clearRetryTimer();


          pairingCode =
            null;

          codeCreatedAt =
            0;

          pairingRequested =
            false;


          console.log("");
          console.log(
            "================================"
          );

          console.log(
            "✅ SPOPO BOT CONNECTED"
          );

          console.log(
            "🛒 ECONOMY ONLINE"
          );

          console.log(
            "🛡️ SECURITY ONLINE"
          );

          console.log(
            "👑 RANKS ONLINE"
          );

          console.log(
            "================================"
          );

          console.log("");


          return;
        }


        /* =========================
           CLOSE
           ========================= */

        if (
          connection ===
          "close"
        ) {

          connected =
            false;


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
            "❌ CONNECTION CLOSED"
          );

          console.log(
            "STATUS:",
            statusCode ||
              "unknown"
          );

          console.log(
            "================================"
          );


          if (
            mySocketId !==
            currentSocketId
          ) {
            return;
          }


          const registered =
            newSock.authState?.creds?.registered;


          /*
            LOGGED OUT
          */

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            resetPairing();

            sock =
              null;

            status =
              "error";

            message =
              "الحساب خرج من WhatsApp. خاص ربط جديد.";


            return;
          }


          /*
            إذا الحساب كان مربوط:
            reconnect
          */

          if (
            registered
          ) {

            resetPairing();

            sock =
              null;


            status =
              "reconnecting";

            message =
              "الاتصال تقطع، غادي نعاود الاتصال...";


            retryTimer =
              setTimeout(
                async () => {

                  retryTimer =
                    null;

                  await startBot();

                },
                10000
              );


            return;
          }


          /*
            الحساب مازال ما تربطش:
            ننتظرو 5 دقايق
          */

          resetPairing();

          sock =
            null;


          status =
            "waiting";

          message =
            "الاتصال فشل. غادي نعاود المحاولة بعد 5 دقايق.";


          scheduleRetry(
            "الاتصال فشل. غادي نعاود المحاولة بعد 5 دقايق."
          );

        }

      }
    );


    /* =========================
       MESSAGES
       ========================= */

    newSock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        try {

          const msg =
            messages?.[0];


          if (!msg) {
            return;
          }


          if (
            msg.key?.fromMe
          ) {
            return;
          }


          const jid =
            msg.key?.remoteJid;


          if (!jid) {
            return;
          }


          if (
            jid ===
            "status@broadcast"
          ) {
            return;
          }


          const text =
            getText(msg);


          if (!text) {
            return;
          }


          let metadata =
            null;


          if (
            isGroup(jid)
          ) {

            metadata =
              await getGroupMetadata(
                jid
              );


            if (!metadata) {
              return;
            }


            /*
              Security before commands
            */

            const blocked =
              await checkSecurity(
                msg,
                jid,
                metadata,
                text
              );


            if (blocked) {
              return;
            }
          }


          const parsed =
            parseCommand(
              text
            );


          if (!parsed) {
            return;
          }


          await handleCommand(
            msg,
            jid,
            metadata,
            parsed.command,
            parsed.args
          );


        } catch (error) {

          console.log(
            "MESSAGE ERROR:",
            error?.message || error
          );

        }

      }
    );


    starting =
      false;


    if (
      alreadyRegistered
    ) {

      status =
        "connecting";

      message =
        "الحساب مسجل، جاري الاتصال...";

    }


  } catch (error) {

    starting =
      false;


    console.log(
      "START ERROR:",
      error?.message || error
    );


    if (
      mySocketId !==
      currentSocketId
    ) {
      return;
    }


    sock =
      null;


    resetPairing();


    status =
      "error";

    message =
      "فشل تشغيل البوت. غادي نعاود المحاولة بعد 5 دقايق.";


    scheduleRetry(
      "فشل تشغيل البوت. غادي نعاود المحاولة بعد 5 دقايق."
    );
  }
}


/* =========================================================
   ERROR PROTECTION
   ========================================================= */

process.on(
  "uncaughtException",
  error => {

    console.log(
      "❌ UNCAUGHT:",
      error?.message ||
      error
    );

  }
);


process.on(
  "unhandledRejection",
  error => {

    console.log(
      "❌ REJECTION:",
      error?.message ||
      error
    );

  }
);


/* =========================================================
   START
   ========================================================= */

console.log("");
console.log(
  "================================"
);

console.log(
  "🤖 SPOPO BOT"
);

console.log(
  "📱 +212644140800"
);

console.log(
  "🛒 SHOP + ECONOMY"
);

console.log(
  "🛡️ GROUP SECURITY"
);

console.log(
  "👑 RANK SYSTEM"
);

console.log(
  "🔐 PAIRING CODE ONLY"
);

console.log(
  "🚫 NO QR"
);

console.log(
  "================================"
);

console.log("");


startBot();
