// api/pusher-auth.js  (Vercel Node Serverless, ESM)
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // Pusher posílá { socket_id, channel_name } (+ naše username v params)
  const { socket_id, channel_name, username = "anon" } = req.body || {};
  if (!socket_id || !channel_name) {
    res.status(400).send("Bad request");
    return;
  }

  // Presence kanál potřebuje user_id + user_info
  const presenceData = {
    user_id: `${Date.now()}_${Math.floor(Math.random() * 999999)}`,
    user_info: { name: String(username || "player").slice(0, 24) },
  };

  const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
  res.send(auth);
}