// src/realtime/pusherClient.js
import Pusher from "pusher-js";
import { getOrCreateUser } from "../lib/user";

const key = import.meta.env.VITE_PUSHER_KEY;
const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "eu";
const authEndpoint = import.meta.env.VITE_PUSHER_AUTH_URL || "/api/pusher-auth";

if (!key) {
  console.warn("[pusherClient] Missing VITE_PUSHER_KEY");
}

const user = getOrCreateUser();

export const pusher = new Pusher(key, {
  cluster,
  forceTLS: true,
  channelAuthorization: {
    endpoint: authEndpoint,   // relativní /api/pusher-auth funguje lokálně i na Vercelu
    transport: "ajax",
    params: {
      username: user.name,
      user_id: user.id,
    },
    headers: {
      "X-App-Version": "web-1",
    },
  },
  // logToConsole: true,
});

/**
 * Přihlášení na presence kanál, vrací Promise s channel objektem.
 * Vyhodí chybu, když se subscription nepovede.
 */
export function ensurePresence(name) {
  return new Promise((resolve, reject) => {
    const ch = pusher.subscribe(name);
    ch.bind("pusher:subscription_succeeded", () => resolve(ch));
    ch.bind("pusher:subscription_error", (e) => {
      reject(new Error("Subscription error " + JSON.stringify(e)));
    });
  });
}