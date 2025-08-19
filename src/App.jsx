// src/App.jsx
import React from "react";
import Game from "./Game.jsx";
import Multiplayer from "./Multiplayer.jsx";

export default function App() {
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Crash Aim – Otestuj své reflexy a vyhraj!</h1>
      </header>

      <Game />
      <Multiplayer />

      <footer className="text-xs text-slate-500 pt-8">
        Ovládání: Space / Enter – Start/Stop.  
        Multiplayer: vytvoř místnost, přizvi kamarády, host spouští synchronní kolo.
      </footer>
    </main>
  );
}