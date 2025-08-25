import React from "react";
import { initials, hueFromId, emojiFromId } from "../lib/user";

export default function Avatar({ name, userId, size = 28, useEmoji = true }) {
  const h = hueFromId(userId || name || "x");
  const bg = `hsl(${h} 70% 45% / 0.15)`;
  const bd = `hsl(${h} 70% 45% / 0.35)`;
  const fg = `hsl(${h} 70% 25%)`;
  const content = useEmoji ? emojiFromId(userId) : initials(name);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full border"
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: bg,
        borderColor: bd,
        color: fg,
        fontSize: Math.round(size * 0.6),
      }}
      title={`${name || "Player"} • ${userId || ""}`}
    >
      {content}
    </span>
  );
}