import React, { useEffect, useState } from "react";

function ScopeTabs({ scope, setScope }) {
  const btn = (key, label) => (
    <button
      key={key}
      onClick={() => setScope(key)}
      className={`px-3 py-1.5 rounded border text-sm ${
        scope === key
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white dark:bg-slate-900 border-neutral-200 dark:border-slate-700"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {btn("all", "All-time")}
      {btn("month", "Měsíc")}
      {btn("week", "Týden")}
      {btn("day", "Den")}
    </div>
  );
}

export default function Leaderboard() {
  const [scope, setScope] = useState("month");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async (sc = scope) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/score-top?scope=${encodeURIComponent(sc)}&limit=25`).then(x => x.json());
      setItems(Array.isArray(r?.items) ? r.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(scope); }, [scope]);

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <ScopeTabs scope={scope} setScope={setScope} />
      </div>

      <div className="mt-3 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-slate-500">Načítám…</div>
        ) : items.length ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-4">#</th>
                <th className="py-1 pr-4">Hráč</th>
                <th className="py-1 pr-4">Skóre</th>
                <th className="py-1 pr-4">Hodnota</th>
                <th className="py-1 pr-4">Cíl</th>
                <th className="py-1 pr-4">Δ</th>
                <th className="py-1 pr-4">Datum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} className="border-t border-neutral-200 dark:border-slate-800">
                  <td className="py-1 pr-4">{i + 1}.</td>
                  <td className="py-1 pr-4">{r.name}</td>
                  <td className="py-1 pr-4 font-semibold">{r.score}</td>
                  <td className="py-1 pr-4">{Number(r.value).toFixed(2)}×</td>
                  <td className="py-1 pr-4">{Number(r.target).toFixed(2)}×</td>
                  <td className="py-1 pr-4">{Number(r.diff).toFixed(2)}×</td>
                  <td className="py-1 pr-4 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-slate-500">Zatím žádná data.</div>
        )}
      </div>
    </section>
  );
}