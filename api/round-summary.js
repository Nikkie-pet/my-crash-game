// /api/round-summary.js (ESM)
import { createClient } from "@supabase/supabase-js";
import Pusher from "pusher";

const {
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Server not configured" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const room = String(body.room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    const roundId = String(body.roundId || "");
    if (!room || !roundId) return res.status(400).json({ ok: false, error: "room & roundId required" });

    // načti kolo (target atd.)
    const { data: rounds, error: er1 } = await supabase
      .from("rounds")
      .select("*")
      .eq("round_id", roundId)
      .limit(1);

    if (er1) throw er1;
    const round = rounds?.[0];
    if (!round) return res.status(404).json({ ok: false, error: "Round not found" });

    // výsledky
    const { data: results, error: er2 } = await supabase
      .from("round_results")
      .select("user_id,name,value,diff,score,crashed,created_at")
      .eq("round_id", roundId)
      .eq("room", room);

    if (er2) throw er2;

    const sorted = (results || [])
      .map(r => ({
        userId: r.user_id,
        name: r.name,
        value: Number(r.value),
        diff: Number(r.diff),
        score: Number(r.score),
        crashed: !!r.crashed,
      }))
      .sort((a, b) => a.diff - b.diff || b.score - a.score);

    const summary = {
      roundId,
      target: Number(round.target),
      expectedPlayers: null, // můžeme dopočítat z presence, ale není nutné
      results: sorted,
    };

    // broadcast všem v místnosti
    await pusher.trigger(`private-room-${room}-results`, "round-summary", summary);

    // označ kolo jako dokončené
    await supabase.from("rounds").update({ status: "finished" }).eq("round_id", roundId);

    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    console.error("[round-summary] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}