export function getOrCreateUser() {
  let id = localStorage.getItem("mp_uid");
  if (!id) {
    const buf = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    id = Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("mp_uid", id);
  }
  let name = (localStorage.getItem("mp_name") || "Player").trim();
  return { id, name };
}

export function setUserName(name) {
  const clean = (name || "Player").replace(/\s+/g, " ").trim().slice(0, 24);
  localStorage.setItem("mp_name", clean);
  return clean;
}

export function shortId(id) {
  if (!id) return "????";
  return String(id).slice(-4).toUpperCase();
}

export function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const chars = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  return chars.toUpperCase() || "🙂";
}

export function hueFromId(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export const AVATAR_EMOJIS = ["🙂","😎","🤖","🦄","🐼","🐯","🐸","🐙","🦊","🐨","🐵","🐧","🐻","🦁","🦉"];
export function emojiFromId(id) {
  if (!id) return "🙂";
  let sum = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return AVATAR_EMOJIS[sum % AVATAR_EMOJIS.length];
}