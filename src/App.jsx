// src/App.jsx
import React from "react";
import Game from "./Game";
import { useTranslation } from "react-i18next";

export default function App() {
  const { t, i18n } = useTranslation();

  // === Build badge (Vercel)
  const sha = (import.meta.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);

  // === Mute (ukládáme do localStorage a posíláme eventem na Game)
  const [muted, setMuted] = React.useState(() => localStorage.getItem("muted") === "1");
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("muted", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted: next } }));
  };

  // === Jazyk
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("lang", lng);
  };

  // === Dark mode (class na <html>) + persist
  const getInitialTheme = () => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved; // "dark" | "light"
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  };
  const [theme, setTheme] = React.useState(getInitialTheme);
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="min-h-screen">
      {/* Horní lišta */}
      <header className="sticky top-0 z-40 bg-neutral-50/80 backdrop-blur border-b border-neutral-200 dark:bg-slate-950/70 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500" aria-hidden />
            <span className="font-extrabold tracking-tight">Crash&nbsp;Aim</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark/Light */}
            <button
              onClick={toggleTheme}
              className="px-2.5 py-1.5 rounded-lg text-sm font-semibold shadow-soft bg-white border border-neutral-200 hover:bg-neutral-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
              title={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>

            {/* Mute */}
            <button
              onClick={toggleMute}
              className={`px-2.5 py-1.5 rounded-lg text-sm font-semibold shadow-soft ${
                muted
                  ? "bg-neutral-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              }`}
              title={muted ? "Zapnout zvuk" : "Vypnout zvuk"}
            >
              {muted ? "🔇" : "🔊"}
            </button>

            <div className="h-5 w-px bg-neutral-300 mx-1 dark:bg-slate-700" />

            {/* Jazyk */}
            <button
              onClick={() => changeLanguage("cs")}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-white border border-neutral-200 hover:bg-neutral-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              CS
            </button>
            <button
              onClick={() => changeLanguage("en")}
              className="px-2.5 py-1.5 rounded-lg text-sm bg-white border border-neutral-200 hover:bg-neutral-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* Build badge */}
      <div className="fixed bottom-3 right-3 text-[10px] text-slate-500 dark:text-slate-400">
        build {sha || "dev"}
      </div>

      {/* Obsah */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("welcome")}
          </h1>
        </div>
        <Game />
      </main>
    </div>
  );
}