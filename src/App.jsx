// src/App.jsx
import React from "react";
import Game from "./Game";
import Multiplayer from "./Multiplayer";

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Crash Aim</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          DEBUG: zobrazujeme <strong>Game</strong> i <strong>Multiplayer</strong> současně.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
        {/* SOLO hra */}
        <section>
          <h2 className="sr-only">Solo</h2>
          <Game />
        </section>

        {/* MULTIPLAYER – vždy vykreslený pro kontrolu */}
        <section className="border border-dashed border-amber-400 rounded-xl p-4 bg-white/60 dark:bg-slate-900/60">
          <div className="text-xs text-amber-700 dark:text-amber-300 mb-2">
            DEBUG: Multiplayer je zobrazený níže nezávisle na přepínači.
          </div>
          <Multiplayer />
        </section>
      </main>
    </div>
  );
}