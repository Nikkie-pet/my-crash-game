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
    <div className="min-h-screen bg-fuchsia-900 text-white">
      <div className="fixed top-2 left-2 z-50 text-xs bg-black/70 px-2 py-1 rounded">
        build: {sha || "dev"}
      </div>

      <div className="flex justify-end items-center gap-2 p-4">
        <button
          onClick={toggleMute}
          className={`px-3 py-1 rounded font-semibold ${muted ? "bg-gray-700" : "bg-yellow-400 text-black"}`}
          title={muted ? "Zapnout zvuk" : "Vypnout zvuk"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button onClick={() => changeLanguage("cs")} className="px-3 py-1 rounded bg-white text-black">CS</button>
        <button onClick={() => changeLanguage("en")} className="px-3 py-1 rounded bg-white text-black">EN</button>
      </div>

      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-3xl font-bold mb-4">{t("welcome")}</h1>
        <Game />
      </div>
    </div>
  );
}