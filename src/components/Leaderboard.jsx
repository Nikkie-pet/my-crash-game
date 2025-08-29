// src/components/Leaderboard.jsx
import React, { useEffect, useState } from "react";

const scopes = [
  { id: "all",  cs: "Celkové", en: "All-time" },
  { id: "month", cs: "Měsíc",  en: "Month" },
  { id: "week",  cs: "Týden",  en: "Week" },
  { id: "day",   cs: "Den",    en: "Day" },
];

export default function Leaderboard({ lang = "cs" }) {
  const [scope, setScope] = useState("day");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async (sc = scope) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/score-top?scope=${encodeURIComponent(sc)}&limit=25`);
      const j = await r.json();
      setRows(j?.items || []);
    } catch (e) {
      console.warn("leaderboard load failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(scope); /* eslint-disable-next-line */ }, [scope]);

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{lang === "cs" ? "Žebříček" : "Leaderboard"}</h2>
        <div className="flex gap-2">
          {scopes.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={
                "px-3 py-1.5 rounded-lg border text-sm " +
                (scope === s.id
                  ? "bg-indigo-600 text-white border-indigo-700"
                  : "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border-neutral-300 dark:border-slate-700")
              }
            >
              {lang === "cs" ? s.cs : s.en}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-4">#</th>
              <th className="py-1 pr-4">{lang === "cs" ? "Hráč" : "Player"}</th>
              <th className="py-1 pr-4">{lang === "cs" ? "Skóre" : "Score"}</th>
              <th className="py-1 pr-4">{lang === "cs" ? "Hodnota" : "Value"}</th>
              <th className="py-1 pr-4">Δ</th>
              <th className="py-1 pr-4">{lang === "cs" ? "Kdy" : "When"}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-4 text-slate-500" colSpan={6}>{lang === "cs" ? "Načítám…" : "Loading…"}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-4 text-slate-500" colSpan={6}>{lang === "cs" ? "Zatím žádná data" : "No data yet"}</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.user_id}-${r.created_at}-${i}`} className="border-t border-neutral-200 dark:border-slate-800">
                  <td className="py-1 pr-4">{i + 1}.</td>
                  <td className="py-1 pr-4">{r.name}</td>
                  <td className="py-1 pr-4 font-semibold">{r.score}</td>
                  <td className="py-1 pr-4">{Number(r.value).toFixed(2)}× ({Number(r.target).toFixed(2)}×)</td>
                  <td className="py-1 pr-4">{Number(r.diff).toFixed(2)}×</td>
                  <td className="py-1 pr-4">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}