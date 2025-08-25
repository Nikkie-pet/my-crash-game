// src/realtime/pusherClient.js
import Pusher from "pusher-js";

// pro ladění – klidně vypni po odladění
Pusher.logToConsole = true;

export function createPusher(username = "anon") {
  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

  // pokud vyvíjíš s `vercel dev`, tenhle řádek v .env.local neměj
  // pokud jedeš bez `vercel dev`, můžeš nastavit prod URL v .env.local
  const authEndpoint = import.meta.env.VITE_PUSHER_AUTH_URL || "/api/pusher-auth";

  console.log("[PUSHER] init →", { key, cluster, authEndpoint, username });

  if (!key || !cluster) {
    throw new Error("Chybí VITE_PUSHER_KEY nebo VITE_PUSHER_CLUSTER. Zkontroluj .env.local a restartuj dev server.");
  }

  const p = new Pusher(key, {
    cluster,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],
    channelAuthorization: {
      endpoint: authEndpoint,
      transport: "ajax",      // ✅ Pusher podporuje 'ajax' (XHR) a 'jsonp'
      params: { username },   // dorazí do /api/pusher-auth jako form-urlencoded
    },
  });

  p.connection.bind("state_change", (st) => {
    console.log("[PUSHER] state:", st.previous, "→", st.current);
  });
  p.connection.bind("error", (err) => {
    console.error("[PUSHER] connection error:", err);
  });

  return p;
}