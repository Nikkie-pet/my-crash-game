import React, { useEffect, useState } from "react";
import Game from "./Game.jsx";
import Multiplayer from "./Multiplayer.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import Toasts from "./components/Toasts.jsx";

export default function App() {
  const [muted, setMuted] = useState(() => localStorage.getItem("muted") === "1");

  useEffect(() => {
    localStorage.setItem("muted", muted ? "1" : "0");
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted } }));
  }, [muted]);

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">
          Crash Aim – Otestuj své reflexy a vyhraj!
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            className="px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 text-sm"
            title="Zvuk on/off"
          >
            {muted ? "🔇 Mute" : "🔊 Sound"}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <Game />
      <Multiplayer />
      <Leaderboard />

      <footer className="text-xs text-slate-500 pt-8">
        Ovládání: Space / Enter – Start/Stop.  
        Multiplayer: vytvoř místnost, označ „I’m ready“, host spouští synchronní kolo po READY všech hráčů.
      </footer>

      <Toasts />
    </main>
  );
}