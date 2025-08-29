// /api/round-start.js (ESM)
import crypto from "node:crypto";
import Pusher from "pusher";
import { createClient } from "@supabase/supabase-js";

const {
  ROUND_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER,
} = process.env;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: PUSHER_CLUSTER,
  useTLS: true,
});

const hmac = (obj) =>
  crypto.createHmac("sha256", ROUND_SECRET || "dev").update(JSON.stringify(obj)).digest("hex");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!ROUND_SECRET || !supabase) return res.status(500).json({ ok: false, error: "Server not configured" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const room = String(body.room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    const startDelayMs = Math.max(1000, Math.min(15000, Number(body.startDelayMs || 3000))); // 1–15 s
    if (!room) return res.status(400).json({ ok: false, error: "room required" });

    // Parametry kola
    const maxTime = 8000;
    const maxMult = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
    const tMax = Math.max(1.10, maxMult - 0.05);
    const target = Number((1.10 + Math.random() * (tMax - 1.10)).toFixed(2));
    const startAt = Date.now() + startDelayMs;
    const endAt = startAt + maxTime;
    const seed = Math.floor(1e12 + Math.random() * 9e12);
    const round = { room, startAt, maxTime, maxMult, target, seed };
    const sig = hmac(round);
    const roundId = String(seed);

    // uložit do DB
    const { error } = await supabase.from("rounds").insert({
      round_id: roundId,
      room,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      max_time: maxTime,
      max_mult: maxMult,
      target,
      status: "running",
    });
    if (error) throw error;

    // broadcast přes Pusher (server event)
    await pusher.trigger(`private-room-${room}-control`, "mp-start", { ...round, sig });

    return res.status(200).json({ ok: true, roundId, ...round, sig });
  } catch (e) {
    console.error("[round-start] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}