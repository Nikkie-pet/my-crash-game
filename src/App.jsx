import React, { useEffect, useState } from "react";
import Game from "./Game.jsx";
import Multiplayer from "./Multiplayer.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import Toasts from "./components/Toasts.jsx";
import LanguageSwitch, { useLang, t } from "./components/LanguageSwitch.jsx";
import Rules from "./components/Rules.jsx";

export default function App() {
  const [lang, setLang] = useLang();

  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark" ||
      (localStorage.getItem("theme") === null && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const toggleMute = () => {
    const next = !(localStorage.getItem("muted") === "1");
    localStorage.setItem("muted", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted: next } }));
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/70 dark:bg-slate-950/70 backdrop-blur border-b border-neutral-200/70 dark:border-slate-800/70">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="font-bold text-lg">{t(lang, "title")}</h1>
          <div className="flex items-center gap-2">
            <LanguageSwitch lang={lang} setLang={setLang} />
            <button
              onClick={() => setDark((d) => !d)}
              className="px-3 py-1.5 rounded border border-neutral-300 dark:border-slate-700"
              title={dark ? t(lang, "light") : t(lang, "dark")}
            >
              {dark ? t(lang, "light") : t(lang, "dark")}
            </button>
            <button
              onClick={toggleMute}
              className="px-3 py-1.5 rounded border border-neutral-300 dark:border-slate-700"
              title={t(lang, "mute")}
            >
              🔇/🔊
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-6">
        <Game lang={lang} />
        <Multiplayer lang={lang} />
        <Leaderboard lang={lang} />
        <Rules lang={lang} />
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-8 text-xs text-slate-500">
        <div>Enter/Space = Start/Stop • {t(lang, "goalText")}</div>
      </footer>

      <Toasts />
    </div>
  );
}