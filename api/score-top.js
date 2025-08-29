import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && srv ? createClient(url, srv) : null;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Supabase not configured" });

  try {
    const urlObj = new URL(req.url, "http://x");
    const scope = urlObj.searchParams.get("scope") || "all"; // all | month | week | day
    const limit = Math.min(100, Math.max(10, Number(urlObj.searchParams.get("limit") || 25)));

    let fromDate = null;
    const now = new Date();

    if (scope === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (scope === "week") {
      const day = now.getDay() || 7; // Po=1 … Ne=7
      fromDate = new Date(now); fromDate.setDate(now.getDate() - (day - 1)); fromDate.setHours(0,0,0,0);
    } else if (scope === "day") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    let query = supabase
      .from("scores")
      .select("user_id,name,score,value,target,diff,crashed,room,round_id,created_at")
      .order("score", { ascending: false })
      .limit(limit);

    if (fromDate) query = query.gte("created_at", fromDate.toISOString());

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e) {
    console.error("[/api/score-top] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}