import Pusher from "pusher-js";

export function createPusher(username="Player"){
  const key = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "eu";
  const authEndpoint = import.meta.env.VITE_PUSHER_AUTH_URL || "/api/pusher-auth";
  if(!key) throw new Error("Missing VITE_PUSHER_KEY");
  const p = new Pusher(key, {
    cluster,
    channelAuthorization: {
      endpoint: authEndpoint,
      transport: "ajax", // Vercel-friendly
    },
    userAuthentication: { endpoint: authEndpoint, transport: "ajax" },
  });
  // Propagace jména pro presence
  p.config.auth = { headers: { "X-Username": encodeURIComponent(username) } };
  return p;
}