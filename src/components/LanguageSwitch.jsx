import React, { useEffect, useState } from "react";

const STRINGS = {
  cs: {
    title: "Crash Aim",
    dark: "Tmavý",
    light: "Světlý",
    mute: "Zvuk",
    rules: "Pravidla",
    goalTitle: "Cíl hry",
    goalText: "Zastav čáru co nejblíže cílovému multiplikátoru.",
    controlsTitle: "Ovládání",
    controlsEnter: "Enter / Space — Start/Stop",
    scoringTitle: "Bodování",
    scoringText: "Čím menší rozdíl Δ mezi zastavenou hodnotou a cílem, tím vyšší skóre (max 1000).",
    tipsTitle: "Tipy",
    tipsText: "Počkej na správný rytmus, sleduj odpočet a zkus trénovat načasování.",
  },
  en: {
    title: "Crash Aim",
    dark: "Dark",
    light: "Light",
    mute: "Sound",
    rules: "Rules",
    goalTitle: "Goal",
    goalText: "Stop as close to the target multiplier as possible.",
    controlsTitle: "Controls",
    controlsEnter: "Enter / Space — Start/Stop",
    scoringTitle: "Scoring",
    scoringText: "The smaller the Δ between your stop value and the target, the higher the score (max 1000).",
    tipsTitle: "Tips",
    tipsText: "Wait for the right rhythm, watch the countdown and practice the timing.",
  },
};

export function useLang() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("lang") || (navigator.language?.startsWith("cs") ? "cs" : "en")
  );
  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);
  return [lang, setLang];
}

export function t(lang, key) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

export default function LanguageSwitch({ lang, setLang }) {
  return (
    <div className="inline-flex items-center gap-2">
      <label className="text-xs text-slate-500">Lang</label>
      <select
        className="px-2 py-1 rounded border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
      >
        <option value="cs">Čeština</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}