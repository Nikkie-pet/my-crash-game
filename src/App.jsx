import React from "react";
import Game from "./Game";
import { useTranslation } from "react-i18next";

export default function App() {
  const { t, i18n } = useTranslation();
  const sha = (import.meta.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  const [muted, setMuted] = React.useState(() => localStorage.getItem("muted") === "1");

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("lang", lng);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("muted", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("cg-mute-change", { detail: { muted: next } }));
  };

  return (
    <div className="min-h-screen">
      {/* horní lišta */}
      <header className="sticky top-0 z-40 bg-neutral-50/80 backdrop-blur border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500" aria-hidden />
            <span className="font-extrabold tracking-tight">Crash&nbsp;Aim</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={`px-3 py-1 rounded-lg text-sm font-semibold shadow-soft
                ${muted ? "bg-neutral-200 text-slate-700" : "bg-emerald-500 text-white hover:bg-emerald-600"}
              `}
              title={muted ? "Zapnout zvuk" : "Vypnout zvuk"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <div className="h-5 w-px bg-neutral-300 mx-1" />
            <button
              onClick={() => changeLanguage("cs")}
              className="px-2 py-1 rounded-lg text-sm bg-white border border-neutral-200 hover:bg-neutral-100"
            >CS</button>
            <button
              onClick={() => changeLanguage("en")}
              className="px-2 py-1 rounded-lg text-sm bg-white border border-neutral-200 hover:bg-neutral-100"
            >EN</button>
          </div>
        </div>
      </header>

      {/* badge buildu – nenápadný */}
      <div className="fixed bottom-3 right-3 text-[10px] text-slate-500">build {sha || "dev"}</div>

      {/* obsah */}
      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{t("welcome")}</h1>
        </div>
        <Game />
      </main>
    </div>
  );
}