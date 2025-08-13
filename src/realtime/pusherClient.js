// src/realtime/pusherClient.js
import Pusher from "pusher-js";

export function createPusher(username = "anon") {
  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn("Missing VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER");
  }

  return new Pusher(key, {
    cluster,
    // Vercel endpoint, který jsme právě vytvořili
    authEndpoint: "/api/pusher-auth",
    auth: {
      headers: { "Content-Type": "application/json" },
      params: { username },
    },
  });
}