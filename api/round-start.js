// /api/round-start.js
import crypto from "node:crypto";
import Pusher from "pusher";

const {
  PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER,
  ROUND_SECRET,
} = process.env;

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: PUSHER_CLUSTER || "eu",
  useTLS: true,
});

function sign(payload) {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", ROUND_SECRET || "dev").update(json).digest("hex");
  return { ...payload, sig };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const room = String(body.room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    if (!room) return res.status(400).json({ ok: false, error: "room required" });

    // parametry kola (hostitel z UI)
    const now = Date.now();
    const startAt = Number(body.startAt ?? now + 3000); // start za 3 s default
    const maxTime = Math.max(3000, Math.min(60000, Number(body.maxTime ?? 8000)));
    const maxMult = Math.max(1.1, Math.min(50, Number(body.maxMult ?? 4.5)));
    const tMax = Math.max(1.1, maxMult - 0.05);
    const target = Math.max(1.1, Math.min(tMax, Number(body.target ?? 1.5)));

    const seed = Number(body.seed ?? startAt);

    const payload = sign({ room, startAt, maxTime, maxMult, target, seed });

    // broadcast do presence kanálu
    await pusher.trigger(`presence-room-${room}`, "round-start", payload);

    return res.status(200).json({ ok: true, round: payload });
  } catch (e) {
    console.error("[/api/round-start] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}