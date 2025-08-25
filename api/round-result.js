// api/round-result.js
import Pusher from "pusher";
import crypto from "crypto";

const {
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER,
  ROUND_SIGN_SECRET,
} = process.env;

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: PUSHER_CLUSTER,
  useTLS: true,
});

function stable(payload) {
  // stejná struktura jako v /api/round-sign
  return {
    room: String(payload.room).toLowerCase().replace(/[^a-z0-9\-]/g, ""),
    startAt: Number(payload.startAt),
    maxTime: Number(payload.maxTime),
    maxMult: Number(payload.maxMult),
    target: Number(payload.target),
    seed: Number(payload.seed),
    ver: 1,
  };
}

function hmac(payload) {
  const json = JSON.stringify(payload);
  return crypto.createHmac("sha256", ROUND_SIGN_SECRET).update(json).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { room, result, round } = body || {};
    if (!room || !result || !round) return res.status(400).json({ ok: false, error: "Missing room/result/round" });
    if (!ROUND_SIGN_SECRET) return res.status(500).json({ ok: false, error: "Missing ROUND_SIGN_SECRET" });

    const channel = `presence-${String(room).toLowerCase().replace(/[^a-z0-9\-]/g, "")}`;

    // 1) ověř podpis
    const norm = stable(round);
    const expectedSig = hmac(norm);
    if (!round.sig || round.sig !== expectedSig) {
      return res.status(403).json({ ok: false, error: "Invalid signature" });
    }

    // 2) ověř časové okno výsledku
    const now = Date.now();
    const startOk = now >= norm.startAt - 1000; // drobná tolerance
    const endOk   = Number(result.ts) <= norm.startAt + norm.maxTime + 2500; // + grace 2.5 s
    if (!startOk || !endOk) {
      return res.status(400).json({ ok: false, error: "Result outside allowed time window" });
    }

    // 3) sanity hodnot
    const v = Number(result.value);
    const t = Number(norm.target);
    if (Number.isNaN(v) || v < 1 || v > 100) {
      return res.status(400).json({ ok: false, error: "Invalid value" });
    }
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));

    // 4) push do room
    const payload = {
      userId: String(result.userId || ""),
      name: String(result.name || "Player"),
      value: v,
      target: t,
      diff,
      score,
      crashed: !!result.crashed,
      ts: Number(result.ts || now),
      roundId: result.roundId ?? norm.seed,
    };

    await pusher.trigger(channel, "server-round-result", payload);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/api/round-result] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}