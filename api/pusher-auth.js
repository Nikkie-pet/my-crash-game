import Pusher from "pusher";

const {
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER,
} = process.env;

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const usernameHeader = req.headers["x-username"];
  const username = decodeURIComponent(Array.isArray(usernameHeader) ? usernameHeader[0] : (usernameHeader || "Player")).trim();

  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8");

  // přijímáme application/x-www-form-urlencoded i JSON
  let socket_id = null, channel_name = null;
  try {
    if (req.headers["content-type"]?.includes("application/json")) {
      const body = JSON.parse(raw || "{}");
      socket_id = body.socket_id;
      channel_name = body.channel_name;
    } else {
      const params = new URLSearchParams(raw);
      socket_id = params.get("socket_id");
      channel_name = params.get("channel_name");
    }
  } catch {}

  if (!socket_id || !channel_name) {
    return res.status(400).json({ ok: false, error: "Missing socket_id/channel_name" });
  }

  const presenceData = {
    user_id: `${Date.now()}_${Math.floor(Math.random()*10000)}`,
    user_info: { name: username || "Player" }
  };

  try {
    const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify(auth));
  } catch (e) {
    console.error("[/api/pusher-auth] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Auth error" });
  }
}