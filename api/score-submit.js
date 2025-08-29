import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !srv) {
  console.warn("[/api/score-submit] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = url && srv ? createClient(url, srv) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Supabase not configured" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    // očekávám payload z Game.jsx (viz níže)
    const { userId, name, score, value, target, diff, crashed, room, roundId } = body || {};

    if (!userId || !name || typeof score !== "number") {
      return res.status(400).json({ ok: false, error: "Missing fields (userId, name, score…)" });
    }

    // drobný anti-spam: ignoruj nulové skóre
    if (score <= 0) return res.status(200).json({ ok: true, ignored: true });

    const insert = {
      user_id: String(userId),
      name: String(name).slice(0, 32),
      score: Math.max(0, Math.floor(score)),
      value: Number(value),
      target: Number(target),
      diff: Number(diff),
      crashed: !!crashed,
      room: room ? String(room).slice(0, 32) : null,
      round_id: roundId ? String(roundId) : null,
    };

    const { error } = await supabase.from("scores").insert(insert);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/api/score-submit] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}