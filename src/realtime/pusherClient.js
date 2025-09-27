// src/realtime/pusherClient.js
import Pusher from "pusher-js";
import { getOrCreateUser } from "../lib/user";

const key = import.meta.env.VITE_PUSHER_KEY;
const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "eu";
const authEndpoint = import.meta.env.VITE_PUSHER_AUTH_URL || "/api/pusher-auth";

const user = getOrCreateUser();

export const pusher = new Pusher(key, {
  cluster,
  forceTLS: true,
  channelAuthorization: {
    endpoint: authEndpoint,   // <- relativní URL funguje všude
    transport: "ajax",        // robustnější než "fetch" v některých prostředích
    params: {
      username: user.name,
      user_id: user.id,
    },
    headers: {
      "X-App-Version": "web-1",
    },
  },
  // logToConsole: true, // zapni pokud potřebuješ ladit
});

/**
 * Přihlášení do presence kanálu s promisem.
 * @param {string} name např. "presence-room-alpha"
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