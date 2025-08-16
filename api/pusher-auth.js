// api/pusher-auth.js  (Node Serverless Function na Vercelu, ESM)
import Pusher from "pusher";

/**
 * Ověř si, že máš na Vercelu (Project → Settings → Environment Variables):
 *  PUSHER_APP_ID
 *  PUSHER_KEY
 *  PUSHER_SECRET
 *  PUSHER_CLUSTER (např. "eu")
 * A ve FE:
 *  VITE_PUSHER_KEY
 *  VITE_PUSHER_CLUSTER
 */

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  // Vercel + pusher-js (s Content-Type: application/json) → req.body je JSON
  // (Pokud by bylo x-www-form-urlencoded, přidej si případné parsování.)
  const { socket_id, channel_name, username = "anon" } = req.body || {};
  if (!socket_id || !channel_name) {
    return json(res, 400, { error: "Bad request" });
  }

  // Presence kanály vyžadují user_id + user_info
  const presenceData = {
    user_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    user_info: { name: String(username || "player").slice(0, 24) },
  };

  try {
    const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
    // Pusher očekává JSON s auth daty
    return json(res, 200, auth);
  } catch (e) {
    return json(res, 500, { error: "Auth failed", detail: e?.message || String(e) });
  }
}