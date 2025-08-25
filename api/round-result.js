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

function stable(r) {
  return {
    room: String(r.room).toLowerCase().replace(/[^a-z0-9\-]/g, ""),
    startAt: Number(r.startAt),
    maxTime: Number(r.maxTime),
    maxMult: Number(r.maxMult),
    target: Number(r.target),
    seed: Number(r.seed),
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
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const { room, result, round } = body || {};
    if (!room || !result || !round) return res.status(400).json({ ok: false, error: "Missing room/result/round" });
    if (!ROUND_SIGN_SECRET) return res.status(500).json({ ok: false, error: "Missing ROUND_SIGN_SECRET" });

    const channel = `presence-${String(room).toLowerCase().replace(/[^a-z0-9\-]/g, "")}`;
    const norm = stable(round);
    const expectedSig = hmac(norm);
    if (!round.sig || round.sig !== expectedSig) {
      return res.status(403).json({ ok: false, error: "Invalid signature" });
    }

    const now = Date.now();
    const startOk = now >= norm.startAt - 1000;
    const endOk = Number(result.ts) <= norm.startAt + norm.maxTime + 2500;
    if (!startOk || !endOk) {
      return res.status(400).json({ ok: false, error: "Result outside allowed time window" });
    }

    const v = Number(result.value);
    const t = Number(norm.target);
    if (Number.isNaN(v) || v < 1 || v > 100) {
      return res.status(400).json({ ok: false, error: "Invalid value" });
    }
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));

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