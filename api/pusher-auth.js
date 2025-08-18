export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await parseBody(req);
    console.log("Auth body:", body);   // 👈 DEBUG
    console.log("ENV check:", {
      id: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET ? "OK" : "MISSING",
      cluster: process.env.PUSHER_CLUSTER,
    });

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
    console.log("Auth response:", auth); // 👈 DEBUG
    return send(res, 200, auth);
  } catch (e) {
    console.error("Auth error:", e); // 👈 DEBUG
    return send(res, 500, { error: "Auth failed", detail: e?.message || String(e) });
  }
}