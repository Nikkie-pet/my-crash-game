// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  // Stav hry
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);          // aktuální ×
  const [target, setTarget] = useState(1.5);        // cílové × (jen číslo, už ne marker)
  const [maxTime, setMaxTime] = useState(8000);     // ms
  const [maxMult, setMaxMult] = useState(4.5);      // × strop
  const [countdownMs, setCountdownMs] = useState(0);
  const [progress, setProgress] = useState(0);      // 0..1 průběh
  const [roundId, setRoundId] = useState(null);

  // Poslední výsledek pro „zpětný pohled“
  const [lastResult, setLastResult] = useState(null); // {value,target,diff,score,crashed,ts,roundId}

  // Debug – životní známky
  const [heartbeat, setHeartbeat] = useState(0);
  const [lastTickAt, setLastTickAt] = useState(0);

  // Refy
  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const startAtRef = useRef(0);           // absolutní start v ms
  const endAtRef = useRef(0);             // start + maxTime
  const cdownTimerRef = useRef(null);
  const rafRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const tickingGuardRef = useRef(0);

  // Heartbeat
  useEffect(() => {
    const hb = setInterval(() => setHeartbeat((n) => (n + 1) % 1_000_000), 500);
    return () => clearInterval(hb);
  }, []);

  // Sync mute
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // MP start kola (přichází sdílené parametry)
  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const mm = clamp(Number(p.maxMult ?? 4.5), 1.05, 50.0);
      const mt = clamp(Number(p.maxTime ?? 8000), 3000, 60000);
      const tMax = Math.max(1.10, mm - 0.05);
      const t  = clamp(Number(p.target ?? 1.5), 1.10, tMax);
      const sa = Number(p.startAt ?? Date.now() + 2000);

      hardReset();
      setMaxMult(mm);
      setMaxTime(mt);
      setTarget(t);
      setValue(1.0);
      setProgress(0);
      setRoundId(p.seed || sa);
      beginCountdownTo(sa);
      toast(`Nové kolo – cíl ${t.toFixed(2)}×`, "info");
    };
    window.addEventListener("cg-mp-round", onRound);
    return () => window.removeEventListener("cg-mp-round", onRound);
  }, []);

  // Klávesy
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); handleStartStop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, countdownMs]);

  // Beep 3·2·1
  useEffect(() => {
    if (countdownMs <= 0) return;
    const secLeft = Math.ceil(countdownMs / 1000);
    if (!mutedRef.current && secLeft > 0) {
      try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play(); } catch {}
    }
  }, [countdownMs]);

  // Úklid
  useEffect(() => () => hardReset(), []);

  // ==== Helpers ====
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
    // rAF
    const rafLoop = () => {
      const now = performance.now ? performance.now() : Date.now();
      doTick(now);
      rafRef.current = requestAnimationFrame(rafLoop);
    };
    rafRef.current = requestAnimationFrame(rafLoop);
    // záložní interval
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
      // konec bez kliknutí = crash
      const finalV = 1.0 + (maxMult - 1.0);
      setValue(finalV);
      finishRound(finalV, true);
    }
  };

  const handleStartStop = () => {
    if (countdownMs > 0) return;
    if (!running) {
      // SOLO parametry – dosažitelný cíl
      const mm = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
      const mt = 8000;
      const tMax = Math.max(1.10, mm - 0.05);
      const t  = Number((1.10 + Math.random() * (tMax - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;

      setMaxMult(mm);
      setMaxTime(mt);
      setTarget(t);
      setValue(1.0);
      setProgress(0);
      setRoundId(Date.now());
      beginCountdownTo(sa);
      toast(`Solo kolo – cíl ${t.toFixed(2)}×`, "info");
    } else {
      // kliknutí = Stop
      try { cancelAnimationFrame(rafRef.current); } catch {}
      try { clearInterval(fallbackTimerRef.current); } catch {}
      rafRef.current = null;
      fallbackTimerRef.current = null;
      setRunning(false);
      const stopped = Number(value.toFixed(4));
      finishRound(stopped, false);
    }
  };

  const finishRound = (finalValue, crashed) => {
    const v = Number(finalValue);
    const t = Number(target);
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));
    const payload = { name: (localStorage.getItem("mp_name") || "Player").trim(), value: v, target: t, diff, score, crashed, ts: Date.now(), roundId };

    setLastResult(payload); // ← uložíme pro „zpětný pohled“
    window.dispatchEvent(new CustomEvent("cg-game-result", { detail: payload }));

    if (!mutedRef.current) {
      try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play(); } catch {}
    }
  };

  // UI labely
  const secondsLabel =
    countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : running ? "Běží…" : "Připraveno";

  // Pozice pro případné značky (0..1)
  const valuePos = clamp((value - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1);
  const lastValuePos = lastResult
    ? clamp((lastResult.value - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1)
    : null;

  return (
    <section className="relative rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
      {/* 3·2·1 overlay */}
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

      {/* Velká hodnota + cíl (číslo) */}
      <div className="mt-4 flex items-end gap-4">
        <div className="text-5xl md:text-6xl font-extrabold tabular-nums tracking-tight">
          {value.toFixed(2)}×
        </div>
        <div className="text-slate-500">
          <div className="text-xs">Cíl</div>
          <div className="text-xl font-semibold">{target.toFixed(2)}×</div>
        </div>
      </div>

      {/* Lišta průběhu – bez target markeru */}
      <div className="relative mt-5 h-4 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 overflow-hidden">
        {/* výplň */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200/50 dark:bg-emerald-900/30 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
        {/* spark během běhu */}
        {running && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-600 transition-[left] duration-100"
            style={{ left: `${valuePos * 100}%` }}
          />
        )}
        {/* stop marker – jen po skončení kola, ukazuje, kde ses zastavila */}
        {!running && lastResult && (
          <div
            className="absolute -top-1.5 w-0 h-0"
            style={{ left: `${lastValuePos * 100}%` }}
            title={`Zastaveno na ${lastResult.value.toFixed(2)}×`}
          >
            {/* malý „špendlík“ */}
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

      {/* Ovládání */}
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

      {/* Karta posledního výsledku */}
      {lastResult && (
        <div className="mt-5 p-4 rounded-xl bg-neutral-50 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 text-sm">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-slate-500">Zastaveno na</div>
              <div className="font-semibold">{lastResult.value.toFixed(2)}×</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Cíl</div>
              <div className="font-semibold">{lastResult.target.toFixed(2)}×</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Odchylka (Δ)</div>
              <div className="font-semibold">{lastResult.diff.toFixed(2)}×</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Skóre</div>
              <div className="font-semibold">{lastResult.score}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Výsledek</div>
              <div className={`font-semibold ${lastResult.crashed ? "text-red-600" : "text-emerald-600"}`}>
                {lastResult.crashed ? "Crash (nekliknuto)" : "Stop (klik)"}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {new Date(lastResult.ts).toLocaleString()}
          </div>
        </div>
      )}

      {/* Debug řádek (nechávám – pomáhá, ale klidně pak smažeme) */}
      <div className="mt-4 text-xs text-slate-500">
        <div>Heartbeat: {heartbeat}</div>
        <div>Last tick: {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : "—"} ({lastTickAt || "—"})</div>
        <div>Progress: {(progress * 100).toFixed(1)}% · Value: {value.toFixed(2)}× · Target: {target.toFixed(2)}×</div>
      </div>
    </section>
  );
}