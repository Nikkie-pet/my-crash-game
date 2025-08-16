// src/realtime/pusherClient.js
import Pusher from "pusher-js";

/**
 * Vite načítá pouze proměnné s prefixem VITE_.
 * Ujisti se, že máš .env.local (lokálně) a na Vercelu (Production/Preview):
 *  VITE_PUSHER_KEY=...
 *  VITE_PUSHER_CLUSTER=eu
 */

export function createPusher(username = "anon") {
  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn("Missing VITE_PUSHER_KEY or VITE_PUSHER_CLUSTER");
  }

  // pusher-js POSTne JSON na /api/pusher-auth
  return new Pusher(key, {
    cluster,
    authEndpoint: "/api/pusher-auth",
    auth: {
      headers: { "Content-Type": "application/json" },
      params: { username }, // projde až do req.body.username
    },
    // pro client-události musí být v Pusher App Settings zapnuto "Client events"
    enableStats: false,
  });
}