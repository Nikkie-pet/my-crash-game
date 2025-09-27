// api/pusher-auth.js  (ESM)
import { URLSearchParams } from "node:url";
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
  cluster: PUSHER_CLUSTER || "eu",
  useTLS: true,
});

function setCORS(res) {
  // Klidně zúž na konkrétní domény (https://<tvoje>.vercel.app, http://localhost:3000)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, X-App-Version, x-username, x-user-id");
}

async function readBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8") || "";
  const ct = (req.headers["content-type"] || "").toLowerCase();

  if (ct.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }
  const params = new URLSearchParams(raw);
  const o = {};
  for (const [k, v] of params.entries()) o[k] = v;
  return o;
}

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = await readBody(req);
    const socketId = body.socket_id || body.socketId;
    const channelName = body.channel_name || body.channel;
    if (!socketId || !channelName) {
      return res.status(400).json({ ok: false, error: "socket_id & channel_name required" });
    }

    // username / user_id přijde z channelAuthorization.params nebo hlaviček
    const usernameHeader = Array.isArray(req.headers["x-username"]) ? req.headers["x-username"][0] : req.headers["x-username"];
    const userIdHeader   = Array.isArray(req.headers["x-user-id"])  ? req.headers["x-user-id"][0]  : req.headers["x-user-id"];

    const username = (body.username ?? usernameHeader ?? "Player").toString().trim().slice(0, 32);
    const userId   = (body.user_id  ?? userIdHeader   ?? `anon_${Math.random().toString(36).slice(2)}`).toString();

    const isPresence = channelName.startsWith("presence-");

    const auth = isPresence
      ? pusher.authorizeChannel(socketId, channelName, { user_id: userId, user_info: { name: username } })
      : pusher.authorizeChannel(socketId, channelName);

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify(auth));
  } catch (e) {
    console.error("[/api/pusher-auth] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Auth error" });
  }
}