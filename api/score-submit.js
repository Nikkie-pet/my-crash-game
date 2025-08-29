// /api/score-submit.js  (ESM)
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Server not configured" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    // základní sanitizace / defaulty
    const row = {
      user_id: String(body.userId || "").slice(0, 64),
      name: String(body.name || "Player").slice(0, 32),
      score: Math.max(0, Math.floor(Number(body.score || 0))),
      value: Number(body.value ?? 1.0),
      target: Number(body.target ?? 1.5),
      diff: Math.abs(Number(body.diff ?? 0)),
      crashed: !!body.crashed,
      room: body.room ? String(body.room).toLowerCase().replace(/[^a-z0-9\-]/g, "") : null,
      round_id: body.roundId ? String(body.roundId).slice(0, 64) : null,
    };

    if (!row.user_id) return res.status(400).json({ ok: false, error: "userId required" });

    const { error } = await supabase.from("scores").insert(row);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[score-submit] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}