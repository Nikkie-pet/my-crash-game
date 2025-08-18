// api/pusher-auth.js
import Pusher from "pusher";

function setCors(res) {
  // pro vývoj klidně povolíme všechny originy; až bude hotovo, můžeš zúžit
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, code, data = null) {
  setCors(res);
  res.statusCode = code;
  if (data !== null) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  } else {
    res.end();
  }
}

async function parseBody(req) {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  if (ct.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }
  const obj = {};
  for (const [k, v] of new URLSearchParams(raw)) obj[k] = v;
  return obj;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, null); // preflight OK
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(res, 405, { error: "Method not allowed" });
  }

  // ENV kontrola
  const envOk = {
    appId: !!process.env.PUSHER_APP_ID,
    key: !!process.env.PUSHER_KEY,
    secret: !!process.env.PUSHER_SECRET,
    cluster: !!process.env.PUSHER_CLUSTER,
  };
  if (!envOk.appId || !envOk.key || !envOk.secret || !envOk.cluster) {
    return send(res, 500, { error: "Missing PUSHER_* env", envOk });
  }

  const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
  });

  try {
    const body = await parseBody(req);
    const socketId = body.socket_id || body.socketId;
    const channelName = body.channel_name || body.channelName;
    const username = (body.username || "player").toString().slice(0, 24);

    if (!socketId || !channelName) {
      return send(res, 400, { error: "Missing socket_id or channel_name" });
    }

    const presenceData = {
      user_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      user_info: { name: username },
    };

    const auth = pusher.authenticate(socketId, channelName, presenceData);
    return send(res, 200, auth);
  } catch (e) {
    return send(res, 500, { error: "Auth failed", detail: e?.message || String(e) });
  }
}