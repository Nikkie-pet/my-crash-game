// /api/score-top.js  (ESM)
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function lowerBoundForScope(scope) {
  const now = new Date();
  switch ((scope || "day").toLowerCase()) {
    case "all":
      return null;
    case "month":
      return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    case "week":
      return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    case "day":
    default:
      return new Date(now.getTime() - 24 * 3600 * 1000);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Server not configured" });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scope = url.searchParams.get("scope") || "day";
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));
    const room = url.searchParams.get("room"); // volitelné: ?room=alpha-team (jen MP)
    const onlyMp = url.searchParams.get("onlyMp") === "1"; // ?onlyMp=1 → pouze záznamy s room != null

    let q = supabase
      .from("scores")
      .select("user_id,name,score,value,target,diff,crashed,created_at,room,round_id")
      .order("score", { ascending: false })
      .limit(limit);

    // filtr času
    const lb = lowerBoundForScope(scope);
    if (lb) q = q.gte("created_at", lb.toISOString());

    // filtr room
    if (room) {
      q = q.eq("room", room.toLowerCase());
    } else if (onlyMp) {
      q = q.not("room", "is", null);
    }

    const { data, error } = await q;
    if (error) throw error;

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e) {
    console.error("[score-top] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}