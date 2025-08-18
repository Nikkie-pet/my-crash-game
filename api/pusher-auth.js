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
  if (ct.includes("application/x-www-form-urlencoded")) {
    const obj = {};
    for (const kv of raw.split("&")) {
      if (!kv) continue;
      const [k, v] = kv.split("=");
      obj[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
    }
    return obj;
  }
  return {};
}

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }

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

    const auth = pusher.authorizeChannel(socketId, channelName, presenceData);
    return send(res, 200, auth);
  } catch (e) {
    return send(res, 500, { error: "Auth failed", detail: e?.message || String(e) });
  }
}