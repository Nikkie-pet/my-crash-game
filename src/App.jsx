import React from "react";
import Game from "./Game";
import { useTranslation } from "react-i18next";

export default function App() {
  const { t, i18n } = useTranslation();

  // Build badge – ukáže 7 znaků SHA z aktuálního deploye
  const sha = (import.meta.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);

  // Mute toggle (pamatuje si stav a dává vědět Game.jsx přes custom event)
  const [muted, setMuted] = React.useState(() => localStorage.getItem("muted") === "1");
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("muted", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted: next } }));
  };

  // Přepínač jazyků
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
  };

  return (
    <div className="min-h-screen bg-fuchsia-900 text-white">
      {/* Build badge – v levém horním rohu */}
      <div className="fixed top-2 left-2 z-50 text-xs bg-black/70 text-white px-2 py-1 rounded">
        build: {sha || "dev"}
      </div>

      {/* Horní lišta: jazyk + mute */}
      <div className="flex justify-end gap-2 p-4">
        <button
          className="px-3 py-1 rounded bg-blue-600 hover:opacity-90"
          onClick={() => changeLanguage("cs")}
          aria-label="Čeština"
        >
          CZ
        </button>
        <button
          className="px-3 py-1 rounded bg-green-600 hover:opacity-90"
          onClick={() => changeLanguage("en")}
          aria-label="English"
        >
          EN
        </button>
        <button
          className={`px-3 py-1 rounded ${muted ? "bg-gray-700" : "bg-yellow-600"} hover:opacity-90`}
          onClick={toggleMute}
          aria-label={muted ? "Zvuk vypnutý" : "Zvuk zapnutý"}
          title="Přepnout zvuk"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* Titulek + testovací změna (ať vidíš nový build) */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-2">{t("welcome", "Crash Aim – Otestuj své reflexy!")}</h1>
        <p className="opacity-90">🚀 Nová verze! (barva + badge by měly být vidět)</p>
      </div>

      {/* Hra */}
      <div className="max-w-5xl mx-auto">
        <Game />
      </div>
    </div>
  );
}