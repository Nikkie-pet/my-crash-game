// api/debug-env.js  (jen dočasně, nechci abys něco tajného ukazovala veřejně)
export default function handler(req, res) {
  const mask = (v) => (v ? `${String(v).slice(0, 3)}…${String(v).slice(-3)}` : null);
  res.status(200).json({
    env: "vercel",
    backend: {
      appId: !!process.env.PUSHER_APP_ID,
      key: mask(process.env.PUSHER_KEY),
      secret: process.env.PUSHER_SECRET ? "SET" : "MISSING",
      cluster: process.env.PUSHER_CLUSTER || null,
    },
  });
}