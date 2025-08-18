// src/realtime/pusherClient.js
import Pusher from "pusher-js";

/**
 * Debug logy Pusheru (zapni jen při ladění).
 * Až bude vše OK, klidně nastav na false nebo řádek smaž.
 */
Pusher.logToConsole = true;

/**
 * Vytvoří Pusher klienta pro frontend.
 * Vyžaduje:
 *  - VITE_PUSHER_KEY (public key z Pusheru)
 *  - VITE_PUSHER_CLUSTER (např. "eu")
 *  - volitelně VITE_PUSHER_AUTH_URL (pro lokální vývoj můžeš použít prod URL)
 *
 * Pokud VITE_PUSHER_AUTH_URL není nastavené, použije relativní "/api/pusher-auth"
 * (to funguje na Vercelu i v `vercel dev`).
 */
export function createPusher(username = "anon") {
  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw new Error("Missing VITE_PUSHER_KEY or VITE_PUSHER_CLUSTER");
  }

  // Lokálně můžeš přesměrovat autorizaci na produkční endpoint,
  // aby Presence fungoval i bez `vercel dev`.
  const authEndpoint =
    import.meta.env.VITE_PUSHER_AUTH_URL || "/api/pusher-auth";

  // Pozn.: pusher-js v8+ používá `channelAuthorization`
  const p = new Pusher(key, {
    cluster,
    forceTLS: true,
    channelAuthorization: {
      endpoint: authEndpoint,
      transport: "ajax",        // pošle form-urlencoded
      params: { username },     // dorazí na server (api/pusher-auth) jako pole
    },
    enabledTransports: ["ws", "wss"],
  });

  return p;
}