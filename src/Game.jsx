// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  // Stav hry
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);          // aktuální ×
  const [target, setTarget] = useState(1.5);        // cílové ×
  const [maxTime, setMaxTime] = useState(8000);     // ms
  const [maxMult, setMaxMult] = useState(4.5);      // × strop
  const [countdownMs, setCountdownMs] = useState(0);
  const [progress, setProgress] = useState(0);      // 0..1
  const [roundId, setRoundId] = useState(null);

  // Debug – jasné důkazy života
  const [heartbeat, setHeartbeat] = useState(0);            // tikne každých 500 ms
  const [lastTickAt, setLastTickAt] = useState(0);          // timestamp posledního výpočtu

  // Refy
  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const startAtRef = useRef(0);           // absolutní čas startu kola (ms)
  const endAtRef = useRef(0);             // start + maxTime
  const cdownTimerRef = useRef(null);     // interval pro odpočet
  const rafRef = useRef(null);            // requestAnimationFrame id
  const fallbackTimerRef = useRef(null);  // záložní setInterval (200 ms)
  const tickingGuardRef = useRef(0);      // ochrana proti dvojímu ticku v jednom čase

  // Heartbeat – každých 500 ms zvětší číslo (pomáhá odhalit, že UI re-renderuje)
  useEffect(() => {
    const hb = setInterval(() => setHeartbeat((n) => (n + 1) % 1000000), 500);
    return () => clearInterval(hb);
  }, []);

  // Sync mute
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // MP start kola (přijde startAt + parametry → všem to běží synchronně)
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
      try {
        new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play();
      } catch {}
    }
  }, [countdownMs]);

  // Úklid všech časovačů
  useEffect(() => () => hardReset(), []);

  // ===== helpers =====
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
        // Nastav absolutní časy startu a konce kola
        startAtRef.current = startAt;
        endAtRef.current = startAt + maxTime;
        startEngines(); // spustit běh
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

    // rAF smyčka
    const rafLoop = () => {
      const now = performance.now ? performance.now() : Date.now();
      doTick(now);
      rafRef.current = requestAnimationFrame(rafLoop);
    };
    rafRef.current = requestAnimationFrame(rafLoop);

    // záložní interval (200 ms) – když by náhodou rAF padal/spal
    fallbackTimerRef.current = setInterval(() => {
      const now = performance.now ? performance.now() : Date.now();
      doTick(now);
    }, 200);
  };

  // Jeden výpočet – **nezávislý na počtu ticků**
  const doTick = (nowLike) => {
    // ochrana: v jednom čase spočítej jen jednou
    const stamp = Math.floor(Number(nowLike));
    if (tickingGuardRef.current === stamp) return;
    tickingGuardRef.current = stamp;

    // VYUŽÍVÁME ABSOLUTNÍ ČASY → nevadí, když tick vypadne
    const nowMs = Date.now();
    setLastTickAt(nowMs);

    // Pokud ještě neodstartovalo (něco je špatně), nic nedělej
    if (!startAtRef.current || !endAtRef.current) return;

    const t = clamp((nowMs - startAtRef.current) / (maxTime || 1), 0, 1);
    const next = 1.0 + (maxMult - 1.0) * t;

    setProgress(t);
    setValue(next);

    if (nowMs >= endAtRef.current) {
      // konec kola
      setRunning(false);
      try { cancelAnimationFrame(rafRef.current); } catch {}
      try { clearInterval(fallbackTimerRef.current); } catch {}
      rafRef.current = null;
      fallbackTimerRef.current = null;
      // dorovnej na strop
      setValue(1.0 + (maxMult - 1.0));
      reportResult(true);
    }
  };

  const handleStartStop = () => {
    if (countdownMs > 0) return;
    if (!running) {
      // SOLO – parametry vždy dosažitelné
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
      // kliknutí = STOP a vyhodnocení
      setRunning(false);
      try { cancelAnimationFrame(rafRef.current); } catch {}
      try { clearInterval(fallbackTimerRef.current); } catch {}
      rafRef.current = null;
      fallbackTimerRef.current = null;
      setValue((v) => Number(v.toFixed(2)));
      reportResult();
    }
  };

  const reportResult = (crashed = false) => {
    const name = (localStorage.getItem("mp_name") || "Player").trim();
    const v = Number(value);
    const t = Number(target);
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));
    const payload = { name, value: v, target: t, score, crashed: !!crashed, ts: Date.now(), roundId };
    window.dispatchEvent(new CustomEvent("cg-game-result", { detail: payload }));
    if (!mutedRef.current) {
      try {
        new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play();
      } catch {}
    }
  };

  // UI labely
  const secondsLabel =
    countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : running ? "Běží…" : "Připraveno";
  const targetPos = clamp((target - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1);

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

      {/* Velká hodnota + cíl */}
      <div className="mt-4 flex items-end gap-4">
        <div className="text-5xl md:text-6xl font-extrabold tabular-nums tracking-tight">
          {value.toFixed(2)}×
        </div>
        <div className="text-slate-500">
          <div className="text-xs">Cíl</div>
          <div className="text-xl font-semibold">{target.toFixed(2)}×</div>
        </div>
      </div>

      {/* Progress + target marker */}
      <div className="relative mt-5 h-4 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200/50 dark:bg-emerald-900/30 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-emerald-600 transition-[left] duration-100"
          style={{ left: `${progress * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-amber-500/80"
          style={{ left: `${targetPos * 100}%` }}
          title={`Cíl ${target.toFixed(2)}×`}
        />
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

      {/* Debug řádek */}
      <div className="mt-4 text-xs text-slate-500">
        <div>Heartbeat: {heartbeat}</div>
        <div>Last tick: {new Date(lastTickAt).toLocaleTimeString()} ({lastTickAt || "—"})</div>
        <div>Progress: {(progress * 100).toFixed(1)}% · Value: {value.toFixed(2)}× · Target: {target.toFixed(2)}×</div>
      </div>
    </section>
  );
}