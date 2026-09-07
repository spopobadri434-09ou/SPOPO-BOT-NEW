import makeWASocket, {
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import http from "http";

const PORT = process.env.PORT || 3000;
const PHONE = "212644140800";

let sock = null;
let pairingCode = null;
let connected = false;
let generating = false;
let lastCodeTime = 0;

const CODE_TIME = 5 * 60 * 1000;

// ==========================
// WEBSITE
// ==========================

const server = http.createServer((req, res) => {

  if (req.url === "/api/status") {

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    res.end(JSON.stringify({
      connected,
      pairingCode,
      expiresIn: pairingCode
        ? Math.max(
            0,
            Math.ceil(
              (CODE_TIME - (Date.now() - lastCodeTime)) / 1000
            )
          )
        : 0
    }));

    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>SPOPO BOT</title>

<style>
body {
  margin:0;
  background:#0b0b0f;
  color:white;
  font-family:Arial,sans-serif;
  text-align:center;
}

.box {
  max-width:420px;
  margin:70px auto;
  padding:30px 20px;
}

h1 {
  font-size:32px;
}

.status {
  margin:20px 0;
  padding:12px;
  border-radius:12px;
  background:#17171d;
}

.code {
  font-size:32px;
  font-weight:bold;
  letter-spacing:6px;
  background:#17171d;
  padding:25px 10px;
  border-radius:15px;
  margin:20px 0;
}

.timer {
  color:#aaa;
}

.phone {
  color:#888;
}

.green {
  color:#35d07f;
}
</style>
</head>

<body>

<div class="box">

<h1>🤖 SPOPO BOT</h1>

<div class="phone">
+212 644 140 800
</div>

<div id="status" class="status">
⏳ جاري تشغيل البوت...
</div>

<div id="code" class="code">
--------
</div>

<div id="timer" class="timer">
انتظر الرمز...
</div>

<p>
📱 واتساب ← الأجهزة المرتبطة ← ربط جهاز
</p>

</div>

<script>

async function update() {

  try {

    const r = await fetch("/api/status");
    const d = await r.json();

    const status =
      document.getElementById("status");

    const code =
      document.getElementById("code");

    const timer =
      document.getElementById("timer");

    if (d.connected) {

      status.innerHTML =
        '<span class="green">🟢 واتساب متصل</span>';

      code.innerText = "CONNECTED";
      timer.innerText =
        "تم الربط بنجاح ✅";

      return;
    }

    status.innerText =
      "🟡 في انتظار ربط واتساب";

    code.innerText =
      d.pairingCode || "--------";

    if (d.expiresIn > 0) {

      const min =
        Math.floor(d.expiresIn / 60);

      const sec =
        d.expiresIn % 60;

      timer.innerText =
        "⏱️ الرمز يتجدد بعد " +
        min + ":" +
        String(sec).padStart(2,"0");

    } else {

      timer.innerText =
        "🔄 جاري إنشاء رمز جديد...";
    }

  } catch (e) {

    document.getElementById("status")
      .innerText =
      "❌ تعذر الاتصال بالموقع";
  }
}

update();

setInterval(update, 1000);

</script>

</body>
</html>
  `);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 SPOPO BOT: http://0.0.0.0:${PORT}`);
});

// ==========================
// PAIRING CODE
// ==========================

async function generatePairingCode() {

  if (!sock) return;
  if (connected) return;
  if (generating) return;

  generating = true;

  try {

    await new Promise(resolve =>
      setTimeout(resolve, 2000)
    );

    if (!sock || connected) return;

    const code =
      await sock.requestPairingCode(PHONE);

    pairingCode = code;
    lastCodeTime = Date.now();

    console.log("");
    console.log("==============================");
    console.log("🔢 SPOPO PAIRING CODE");
    console.log(code);
    console.log("==============================");
    console.log("");

  } catch (err) {

    console.log(
      "Pairing Code Error:",
      err?.message || err
    );

  } finally {

    generating = false;
  }
}

// ==========================
// START BOT
// ==========================

async function startBot() {

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState("./session");

  sock = makeWASocket({

    auth: state,

    logger: P({
      level: "silent"
    }),

    printQRInTerminal: false,

    browser: [
      "SPOPO BOT",
      "Chrome",
      "1.0.0"
    ],

    syncFullHistory: false

  });

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  sock.ev.on(
    "connection.update",
    async ({
      connection,
      lastDisconnect
    }) => {

      console.log(
        "Connection:",
        connection
      );

      if (
        connection === "connecting"
      ) {

        connected = false;

        if (!pairingCode) {
          await generatePairingCode();
        }
      }

      if (
        connection === "open"
      ) {

        connected = true;
        pairingCode = null;

        console.log("");
        console.log(
          "✅ SPOPO BOT CONNECTED"
        );
        console.log("");
      }

      if (
        connection === "close"
      ) {

        connected = false;
        pairingCode = null;

        console.log(
          "❌ Connection closed"
        );

        setTimeout(() => {

          sock = null;
          startBot();

        }, 5000);
      }
    }
  );
}

// ==========================
// RENEW CODE EVERY 5 MIN
// ==========================

setInterval(async () => {

  if (connected) return;
  if (!sock) return;

  const elapsed =
    Date.now() - lastCodeTime;

  if (
    elapsed >= CODE_TIME
  ) {

    pairingCode = null;

    console.log(
      "🔄 Pairing Code expired. Generating new one..."
    );

    await generatePairingCode();
  }

}, 5000);

// ==========================
// START
// ==========================

startBot().catch(err => {

  console.error(
    "START ERROR:",
    err
  );

});
