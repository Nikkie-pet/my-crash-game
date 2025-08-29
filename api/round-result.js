// /api/round-result.js (ESM)
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Pusher from "pusher";

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

    const room = String(body?.room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    const result = body?.result || {};
    const round = body?.round || {};
    const sig = String(round.sig || "");
    if (!room || !result?.userId || !sig) return res.status(400).json({ ok: false, error: "Bad payload" });

    // ověř podpis
    const roundPayload = { room: round.room, startAt: round.startAt, maxTime: round.maxTime, maxMult: round.maxMult, target: round.target, seed: round.seed };
    const expectSig = hmac(roundPayload);
    if (sig !== expectSig) return res.status(400).json({ ok: false, error: "Invalid signature" });

    // ověř časové okno
    const now = Date.now();
    const startAt = Number(round.startAt);
    const endAt = startAt + Number(round.maxTime);
    if (!(now >= startAt - 10_000 && now <= endAt + 10_000)) {
      return res.status(400).json({ ok: false, error: "Out of time window" });
    }

    const roundId = String(round.seed);
    const row = {
      round_id: roundId,
      room,
      user_id: String(result.userId),
      name: String(result.name).slice(0, 32),
      value: Number(result.value),
      diff: Number(Math.abs(Number(result.value) - Number(round.target)).toFixed(4)),
      score: Math.max(0, Math.floor(result.score || 0)),
      crashed: !!result.crashed,
    };

    const { error } = await supabase.from("round_results").upsert(row, { onConflict: "round_id,user_id" });
    if (error) throw error;

    // (volitelné) live update
    await pusher.trigger(`private-room-${room}-results`, "partial-result", {
      userId: row.user_id,
      name: row.name,
      value: row.value,
      diff: row.diff,
      score: row.score,
      crashed: row.crashed,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[round-result] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}