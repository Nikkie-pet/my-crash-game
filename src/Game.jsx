import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";
import { getOrCreateUser } from "./lib/user";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);
  const [target, setTarget] = useState(1.5);
  const [maxTime, setMaxTime] = useState(8000);
  const [maxMult, setMaxMult] = useState(4.5);
  const [countdownMs, setCountdownMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [roundId, setRoundId] = useState(null);

  const [lastResult, setLastResult] = useState(null);
  const [roundSummary, setRoundSummary] = useState(null);

  const [heartbeat, setHeartbeat] = useState(0);
  const [lastTickAt, setLastTickAt] = useState(0);

  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const startAtRef = useRef(0);
  const endAtRef = useRef(0);
  const cdownTimerRef = useRef(null);
  const rafRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const tickingGuardRef = useRef(0);

  const roundInfoRef = useRef(null); // { room, startAt, maxTime, maxMult, target, seed, sig }

  useEffect(() => {
    const hb = setInterval(() => setHeartbeat((n) => (n + 1) % 1_000_000), 500);
    return () => clearInterval(hb);
  }, []);

  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const mm = clamp(Number(p.maxMult ?? 4.5), 1.05, 50.0);
      const mt = clamp(Number(p.maxTime ?? 8000), 3000, 60000);
      const tMax = Math.max(1.10, mm - 0.05);
      const t  = clamp(Number(p.target ?? 1.5), 1.10, tMax);
      const sa = Number(p.startAt ?? Date.now() + 2000);

      const room = (localStorage.getItem("mp_room") || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
      roundInfoRef.current = {
        room, startAt: sa, maxTime: mt, maxMult: mm, target: t, seed: Number(p.seed || sa), sig: p.sig,
      };

      hardReset();
      setMaxMult(mm);
      setMaxTime(mt);
      setTarget(t);
      setValue(1.0);
      setProgress(0);
      setRoundId(p.seed || sa);
      setLastResult(null);
      setRoundSummary(null);
      beginCountdownTo(sa);
      toast(`Nové kolo – cíl ${t.toFixed(2)}×`, "info");
    };
    window.addEventListener("cg-mp-round", onRound);
    return () => window.removeEventListener("cg-mp-round", onRound);
  }, []);

  useEffect(() => {
    const onSum = (e) => {
      const d = e.detail || {};
      if (!roundId || (d.roundId && d.roundId !== roundId)) return;
      setRoundSummary(d);
    };
    window.addEventListener("cg-round-summary", onSum);
    return () => window.removeEventListener("cg-round-summary", onSum);
  }, [roundId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); handleStartStop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, countdownMs]);

  useEffect(() => {
    if (countdownMs <= 0) return;
    const secLeft = Math.ceil(countdownMs / 1000);
    if (!mutedRef.current && secLeft > 0) {
      try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play(); } catch {}
    }
  }, [countdownMs]);

  useEffect(() => () => hardReset(), []);

  const hardReset = () => {
    try { clearInterval(cdownTimerRef.current); } catch {}
    try { cancelAnimationFrame(rafRef.current); } catch {}
    try { clearInterval(fallbackTimerRef.current); } catch {}
    cdownTimerRef.current = null;
    rafRef.current = null;
    fallbackTimerRef.current = null;
    tickingGuardRef.current = 0;
    setRunning(false);
  };

  const beginCountdownTo = (startAt) => {
    hardReset();
    const tick = () => {
      const rest = Math.max(0, startAt - Date.now());
      setCountdownMs(rest);
      if (rest <= 0) {
        clearInterval(cdownTimerRef.current);
        cdownTimerRef.current = null;
        startAtRef.current = startAt;
        endAtRef.current = startAt + maxTime;
        startEngines();
      }
    };
    tick();
    cdownTimerRef.current = setInterval(tick, 100);
  };

  const startEngines = () => {
    setRunning(true);
    setValue(1.0);
    setProgress(0);
    setCountdownMs(0);
    const rafLoop = () => {
      const now = performance.now ? performance.now() : Date.now();
      doTick(now);
      rafRef.current = requestAnimationFrame(rafLoop);
    };
    rafRef.current = requestAnimationFrame(rafLoop);
    fallbackTimerRef.current = setInterval(() => {
      const now = performance.now ? performance.now() : Date.now();
      doTick(now);
    }, 200);
  };

  const doTick = (nowLike) => {
    const stamp = Math.floor(Number(nowLike));
    if (tickingGuardRef.current === stamp) return;
    tickingGuardRef.current = stamp;

    const nowMs = Date.now();
    setLastTickAt(nowMs);
    if (!startAtRef.current || !endAtRef.current) return;

    const t = clamp((nowMs - startAtRef.current) / (maxTime || 1), 0, 1);
    setProgress(t);
    setValue(1.0 + (maxMult - 1.0) * t);

    if (nowMs >= endAtRef.current) {
      setRunning(false);
      try { cancelAnimationFrame(rafRef.current); } catch {}
      try { clearInterval(fallbackTimerRef.current); } catch {}
      rafRef.current = null;
      fallbackTimerRef.current = null;

      const finalV = 1.0 + (maxMult - 1.0);
      setValue(finalV);
      finishRound(finalV, true);
    }
  };

  const handleStartStop = () => {
    if (countdownMs > 0) return;
    if (!running) {
      const mm = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
      const mt = 8000;
      const tMax = Math.max(1.10, mm - 0.05);
      const t  = Number((1.10 + Math.random() * (tMax - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;

      roundInfoRef.current = null;
      setMaxMult(mm); setMaxTime(mt); setTarget(t);
      setValue(1.0); setProgress(0);
      setRoundId(Date.now()); setLastResult(null); setRoundSummary(null);
      beginCountdownTo(sa);
      toast(`Solo kolo – cíl ${t.toFixed(2)}×`, "info");
    } else {
      try { cancelAnimationFrame(rafRef.current); } catch {}
      try { clearInterval(fallbackTimerRef.current); } catch {}
      rafRef.current = null; fallbackTimerRef.current = null;
      setRunning(false);
      const stopped = Number(value.toFixed(4));
      finishRound(stopped, false);
    }
  };

  const finishRound = async (finalValue, crashed) => {
    const { id: userId } = getOrCreateUser();
    const name = (localStorage.getItem("mp_name") || "Player").trim();
    const room = (localStorage.getItem("mp_room") || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");

    const v = Number(finalValue);
    const t = Number(target);
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));

    const payload = { userId, name, value: v, target: t, diff, score, crashed, ts: Date.now(), roundId };

    setLastResult(payload);
    window.dispatchEvent(new CustomEvent("cg-game-result", { detail: payload }));

    if (room && roundInfoRef.current?.sig) {
      try {
        await fetch("/api/round-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room,
            result: payload,
            round: {
              room,
              startAt: roundInfoRef.current.startAt,
              maxTime: roundInfoRef.current.maxTime,
              maxMult: roundInfoRef.current.maxMult,
              target: roundInfoRef.current.target,
              seed: roundInfoRef.current.seed,
              sig: roundInfoRef.current.sig,
            },
          }),
        });
      } catch (e) {
        console.warn("POST /api/round-result failed", e);
      }
    }
  };

  const secondsLabel =
    countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : running ? "Běží…" : "Připraveno";

  const valuePos = clamp((value - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1);
  const lastValuePos = lastResult
    ? clamp((lastResult.value - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1)
    : null;

  return (
    <section className="relative rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
      {countdownMs > 0 && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
          <div className="text-white text-7xl md:text-8xl font-extrabold drop-shadow">
            {Math.max(1, Math.ceil(countdownMs / 1000))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Crash Aim</h2>
        <div className="text-sm text-slate-500">{secondsLabel}</div>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div className="text-5xl md:text-6xl font-extrabold tabular-nums tracking-tight">
          {value.toFixed(2)}×
        </div>
        <div className="text-slate-500">
          <div className="text-xs">Cíl</div>
          <div className="text-xl font-semibold">{target.toFixed(2)}×</div>
        </div>
      </div>

      <div className="relative mt-5 h-4 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-emerald-200/50 dark:bg-emerald-900/30 transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
        {running && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-600 transition-[left] duration-100" style={{ left: `${valuePos * 100}%` }} />
        )}
        {!running && lastResult && (
          <div className="absolute -top-1.5 w-0 h-0" style={{ left: `${lastValuePos * 100}%` }} title={`Zastaveno na ${lastResult.value.toFixed(2)}×`}>
            <div className="relative -left-1">
              <div className="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-emerald-600" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-xs text-slate-500 tabular-nums">
        <span>1.00×</span>
        <span>{maxMult.toFixed(2)}×</span>
      </div>

      <div className="mt-6">
        <button
          onClick={handleStartStop}
          disabled={countdownMs > 0}
          className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title={countdownMs > 0 ? "Běží odpočet – počkej na start" : ""}
        >
          {running ? "Stop" : countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : "Start"}
        </button>
      </div>

      {lastResult && (
        <div className="mt-5 p-4 rounded-xl bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 text-sm">
          <div className="flex flex-wrap gap-6">
            <div><div className="text-xs text-slate-500">Zastaveno na</div><div className="font-semibold">{lastResult.value.toFixed(2)}×</div></div>
            <div><div className="text-xs text-slate-500">Cíl</div><div className="font-semibold">{lastResult.target.toFixed(2)}×</div></div>
            <div><div className="text-xs text-slate-500">Δ</div><div className="font-semibold">{lastResult.diff.toFixed(2)}×</div></div>
            <div><div className="text-xs text-slate-500">Skóre</div><div className="font-semibold">{lastResult.score}</div></div>
            <div><div className="text-xs text-slate-500">Výsledek</div><div className={`font-semibold ${lastResult.crashed ? "text-red-600" : "text-emerald-600"}`}>{lastResult.crashed ? "Crash" : "Stop"}</div></div>
          </div>
          <div className="mt-2 text-xs text-slate-500">{new Date(lastResult.ts).toLocaleString()}</div>
        </div>
      )}

      {roundSummary && roundSummary.results?.length > 0 && (
        <div className="mt-5 p-4 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-neutral-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Výsledky kola</h3>
            <div className="text-xs text-slate-500">
              Cíl: {Number(roundSummary.target || target).toFixed(2)}× · Hráči: {roundSummary.results.length}
              {typeof roundSummary.expectedPlayers === "number" ? ` / ${roundSummary.expectedPlayers}` : ""}
            </div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-4">Pořadí</th>
                  <th className="py-1 pr-4">Hráč</th>
                  <th className="py-1 pr-4">Skóre</th>
                  <th className="py-1 pr-4">Hodnota</th>
                  <th className="py-1 pr-4">Δ</th>
                  <th className="py-1 pr-4">Důvod</th>
                </tr>
              </thead>
              <tbody>
                {roundSummary.results.map((r, idx) => (
                  <tr key={idx} className="border-t border-neutral-200 dark:border-slate-800">
                    <td className="py-1 pr-4">{idx + 1}.</td>
                    <td className="py-1 pr-4">{r.name}</td>
                    <td className="py-1 pr-4 font-semibold">{r.score}</td>
                    <td className="py-1 pr-4">{Number(r.value).toFixed(2)}×</td>
                    <td className="py-1 pr-4">{Number(r.diff).toFixed(2)}×</td>
                    <td className="py-1 pr-4">{r.crashed ? "Crash" : "Stop"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-500">Kolo: #{roundSummary.roundId || roundId}</div>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">
        <div>Heartbeat: {heartbeat}</div>
        <div>Last tick: {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : "—"} ({lastTickAt || "—"})</div>
        <div>Progress: {(progress * 100).toFixed(1)}% · Value: {value.toFixed(2)}× · Target: {target.toFixed(2)}×</div>
      </div>
    </section>
  );
}