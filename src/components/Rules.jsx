import React from "react";
import { t } from "./LanguageSwitch";

export default function Rules({ lang }) {
  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <h2 className="text-lg font-semibold mb-3">{t(lang, "rules")}</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-sm font-semibold mb-1">{t(lang, "goalTitle")}</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t(lang, "goalText")}</p>
        </div>

        <div>
          <div className="text-sm font-semibold mb-1">{t(lang, "controlsTitle")}</div>
          <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
            <li>{t(lang, "controlsEnter")}</li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold mb-1">{t(lang, "scoringTitle")}</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t(lang, "scoringText")}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold mb-1">{t(lang, "tipsTitle")}</div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t(lang, "tipsText")}</p>
      </div>
    </section>
  );
}