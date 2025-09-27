// /api/round-result.js
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

// jednoduchá paměť na výsledky (per-deployment; pro produkci později nahradíme DB)
const bucket = new Map(); // key: roundId, value: { room, target, results: [] , expectedPlayers? }

function verify(round) {
  if (!ROUND_SECRET) return true; // dev fallback
  const copy = { ...round };
  const sig = copy.sig; delete copy.sig;
  const json = JSON.stringify(copy);
  const must = crypto.createHmac("sha256", ROUND_SECRET).update(json).digest("hex");
  return sig === must;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const room = String(body.room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    const result = body.result || {};
    const round = body.round || {};

    if (!room) return res.status(400).json({ ok: false, error: "room required" });
    if (!result?.userId) return res.status(400).json({ ok: false, error: "result.userId required" });
    if (!round?.sig || !verify(round)) return res.status(400).json({ ok: false, error: "invalid round signature" });

    const roundId = String(result.roundId || round.seed || round.startAt);
    const key = `${room}:${roundId}`;

    const entry = bucket.get(key) || {
      room,
      target: Number(round.target),
      roundId,
      results: [],
      // volitelně – pokud víš kolik hráčů je „ready“, můžeš sem z UI poslat expectedPlayers
      expectedPlayers: Number(body.expectedPlayers || 0) || undefined,
      createdAt: Date.now(),
    };

    // už existuje výsledek toho usera? přepiš
    const ix = entry.results.findIndex(r => r.userId === result.userId);
    if (ix >= 0) entry.results[ix] = result; else entry.results.push(result);

    // seřaď (menší diff ⇒ víc bodů; už máš score spočítané v klientu)
    entry.results.sort((a, b) => b.score - a.score);

    bucket.set(key, entry);

    // broadcast průběžného souhrnu (live)
    await pusher.trigger(`presence-room-${room}`, "round-summary", {
      room,
      roundId,
      target: entry.target,
      results: entry.results.slice(0, 50), // limit
      expectedPlayers: entry.expectedPlayers,
      updatedAt: Date.now(),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/api/round-result] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}