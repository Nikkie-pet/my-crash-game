import React, { useEffect, useMemo, useState } from "react";

/**
 * Leaderboard (lokální):
 * - Session: výsledky od spuštění stránky
 * - All-time: uloženo v localStorage (nejlepší skóre za hráče)
 */
export default function Leaderboard() {
  const [session, setSession] = useState([]);
  const [allTime, setAllTime] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lb_alltime") || "[]"); } catch { return []; }
  });

  // poslouchá výsledky ze hry
  useEffect(() => {
    const onRes = (e) => {
      const r = e.detail || {};
      // Session – přidej a seřaď
      setSession((prev) => {
        const next = [...prev.filter((x) => !(x.name === r.name && x.score === r.score)), r];
        next.sort((a, b) => b.score - a.score);
        return next.slice(0, 50);
      });
      // All-time – uchovej nejlepší za hráče
      setAllTime((prev) => {
        const map = new Map(prev.map((x) => [x.name, x]));
        const cur = map.get(r.name);
        if (!cur || r.score > cur.score) map.set(r.name, { name: r.name, score: r.score });
        const arr = Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 20);
        localStorage.setItem("lb_alltime", JSON.stringify(arr));
        return arr;
      });
    };
    window.addEventListener("cg-game-result", onRes);
    return () => window.removeEventListener("cg-game-result", onRes);
  }, []);

  const topSession = useMemo(() => session.slice(0, 10), [session]);
  const topAll = useMemo(() => allTime.slice(0, 10), [allTime]);

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <h2 className="text-lg font-semibold mb-3">Leaderboard</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <Board title="Top (session)" items={topSession} />
        <Board title="Top (all-time)" items={topAll} />
      </div>
    </section>
  );
}

function Board({ title, items }) {
  return (
    <div>
      <div className="text-sm text-slate-500 mb-1">{title}</div>
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-4">#</th>
                <th className="py-1 pr-4">Hráč</th>
                <th className="py-1 pr-4">Skóre</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.name + i} className="border-t border-neutral-200 dark:border-slate-800">
                  <td className="py-1 pr-4">{i + 1}</td>
                  <td className="py-1 pr-4">{r.name}</td>
                  <td className="py-1 pr-4 font-semibold">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-slate-500">Zatím žádná data.</div>
      )}
    </div>
  );
}