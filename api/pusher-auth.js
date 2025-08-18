// api/pusher-auth.js
import Pusher from "pusher";

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
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

  // form-urlencoded (co posílá pusher-js při channelAuthorization: transport:'ajax')
  const obj = {};
  for (const [k, v] of new URLSearchParams(raw)) obj[k] = v;
  return obj;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  // --- kontrola ENV (nezobrazujeme tajemství) ---
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

    // Presence vyžaduje user_id + user_info
    const presenceData = {
      user_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      user_info: { name: username },
    };

    // ⬇⬇ DŮLEŽITÉ: u Node SDK je správná metoda `authenticate`
    const auth = pusher.authenticate(socketId, channelName, presenceData);
    return send(res, 200, auth);
  } catch (e) {
    return send(res, 500, { error: "Auth failed", detail: e?.message || String(e) });
  }
}