// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  // Stav hry
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);          // aktuální hodnota ×
  const [target, setTarget] = useState(1.5);        // cíl × (v MP přichází z payloadu)
  const [speed, setSpeed] = useState(0.04);         // tempo růstu
  const [maxTime, setMaxTime] = useState(12000);    // ms
  const [countdownMs, setCountdownMs] = useState(0);// ms do startu (0 = nestartuje)
  const [roundId, setRoundId] = useState(null);
  const [progress, setProgress] = useState(0);      // 0..1 průběh kola

  // Debug stav (zapneš ?debug=1 v URL)
  const debug = (() => {
    try { return new URLSearchParams(location.search).get("debug") === "1"; } catch { return false; }
  })();
  const [lastTickAt, setLastTickAt] = useState(0);

  // Refy / časovače
  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const startAtRef = useRef(0);
  const startTimeRef = useRef(0);
  const countdownTimerRef = useRef(null);
  const gameTimerRef = useRef(null);          // herní setInterval
  const lastBeepSecRef = useRef(null);

  // ===== Listeners =====

  // zvuk on/off (z App.jsx)
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // příchod MP kola (sdílené parametry včetně targetu + startAt)
  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const t  = Number(p.target ?? 1.5);
      const sp = Number(p.speed ?? 0.04);
      const mt = Number(p.maxTime ?? 12000);
      const sa = Number(p.startAt ?? Date.now() + 2000);

      stopAllTimers(); // jistota
      setTarget(clamp(t, 1.0, 999));
      setSpeed(clamp(sp, 0.005, 0.2));
      setMaxTime(clamp(mt, 3000, 60000));
      setValue(1.0);
      setProgress(0);
      setRunning(false);
      setRoundId(p.seed || sa);
      beginCountdownTo(sa);
      toast(`Nové kolo – cíl ${t.toFixed(2)}×`, "info");
    };
    window.addEventListener("cg-mp-round", onRound);
    return () => window.removeEventListener("cg-mp-round", onRound);
  }, []);

  // zvukový „beep“ při 3·2·1
  useEffect(() => {
    if (countdownMs <= 0) return;
    const secLeft = Math.ceil(countdownMs / 1000);
    if (secLeft !== lastBeepSecRef.current) {
      lastBeepSecRef.current = secLeft;
      beep(secLeft);
    }
  }, [countdownMs]);

  // ===== Funkce =====

  const stopAllTimers = () => {
    try { clearInterval(countdownTimerRef.current); } catch {}
    try { clearInterval(gameTimerRef.current); } catch {}
    countdownTimerRef.current = null;
    gameTimerRef.current = null;
  };

  const beep = (secLeft) => {
    if (mutedRef.current) return;
    try {
      if (secLeft > 0) {
        new Audio(
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
        ).play();
      }
    } catch {}
  };

  const beginCountdownTo = (startAtTs) => {
    stopAllTimers();
    startAtRef.current = startAtTs;

    const tickCountdown = () => {
      const rest = Math.max(0, startAtRef.current - Date.now());
      setCountdownMs(rest);
      if (rest <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        startRun();
      }
    };

    // hned nastav a pak každých 100 ms
    tickCountdown();
    countdownTimerRef.current = setInterval(tickCountdown, 100);
  };

  const startRun = () => {
    setRunning(true);
    setValue(1.0);
    setProgress(0);
    startTimeRef.current = Date.now();

    // herní smyčka – každých ~20 ms
    const TICK_MS = 20;
    const tickGame = () => {
      const now = Date.now();
      setLastTickAt(now);
      const elapsed = now - startTimeRef.current;

      // vizuální růst hodnoty
      const next = 1.0 + (elapsed / (1000 / speed)); // lineární „vizuální“ tempo
      setValue(next);

      const p = clamp(elapsed / maxTime, 0, 1);
      setProgress(p);

      if (elapsed >= maxTime) {
        // konec kola bez kliknutí
        setRunning(false);
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
        reportResult(true);
      }
    };

    gameTimerRef.current = setInterval(tickGame, TICK_MS);
  };

  const stopRun = () => {
    if (!running) return;
    setRunning(false);
    clearInterval(gameTimerRef.current);
    gameTimerRef.current = null;
    reportResult();
  };

  const handleClick = () => {
    // během odpočtu nelze startovat
    if (countdownMs > 0) return;

    if (!running) {
      // SOLO režim se 3s odpočtem
      const soloTarget = Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;

      stopAllTimers();
      setTarget(soloTarget);
      setSpeed(0.04);
      setMaxTime(12000);
      setRoundId(Date.now());
      setValue(1.0);
      setProgress(0);
      setRunning(false);

      beginCountdownTo(sa);
      toast(`Solo kolo – cíl ${soloTarget.toFixed(2)}×`, "info");
    } else {
      // kliknutí během běhu = STOP a vyhodnocení
      stopRun();
    }
  };

  const reportResult = (crashed = false) => {
    const name = (localStorage.getItem("mp_name") || "Player").trim();
    const v = Number(value);
    const t = Number(target);
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round(1000 - diff * 1000));

    const payload = {
      name,
      value: v,
      target: t,
      score,
      crashed: !!crashed,
      ts: Date.now(),
      roundId,
    };

    window.dispatchEvent(new CustomEvent("cg-game-result", { detail: payload }));

    if (!mutedRef.current) {
      try {
        new Audio(
          score > 900
            ? "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
            : "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
        ).play();
      } catch {}
    }
  };

  // úklid časovačů při unmountu
  useEffect(() => () => stopAllTimers(), []);

  // ===== UI =====

  const secondsLabel =
    countdownMs > 0
      ? `Start za ${(countdownMs / 1000).toFixed(1)} s`
      : running
      ? "Běží…"
      : "Připraveno";

  // odhad horní hranice pro osu (jen orientační pro „target marker“)
  const estimatedMaxValue = 1.0 + (maxTime / (1000 / speed));
  const targetPos = clamp((target - 1.0) / Math.max(0.001, (estimatedMaxValue - 1.0)), 0, 1);

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

      {/* Header */}
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

      {/* Časová lišta se „sparkem“ a markerem cíle */}
      <div className="relative mt-5 h-4 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 overflow-hidden">
        {/* Progress výplň */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200/50 dark:bg-emerald-900/30 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Spark */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-emerald-600 transition-[left] duration-100"
          style={{ left: `${progress * 100}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-amber-500/80"
          style={{ left: `${targetPos * 100}%` }}
          title={`Cíl ${target.toFixed(2)}×`}
        />
      </div>

      {/* Osa popisky */}
      <div className="mt-2 flex justify-between text-xs text-slate-500 tabular-nums">
        <span>1.00×</span>
        <span>{estimatedMaxValue.toFixed(2)}×</span>
      </div>

      {/* Ovládací tlačítko */}
      <div className="mt-6">
        <button
          onClick={handleClick}
          disabled={countdownMs > 0}
          className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title={countdownMs > 0 ? "Běží odpočet – počkej na start" : ""}
        >
          {running ? "Stop" : countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : "Start"}
        </button>
        {debug && (
          <button
            onClick={() => {
              // okamžitý start bez odpočtu (debug)
              stopAllTimers();
              setRoundId(Date.now());
              setValue(1.0);
              setProgress(0);
              setRunning(false);
              setTarget(Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2)));
              setCountdownMs(0);
              startRun();
            }}
            className="ml-3 px-3 py-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
          >
            Debug: Start now
          </button>
        )}
      </div>

      {/* Nápověda + Debug info */}
      <p className="text-xs text-slate-500 mt-4">
        Space / Enter – Start/Stop. Sleduj horní velkou hodnotu (×), časová lišta ukazuje průběh kola.
        Svislá oranžová čára je cílová hodnota. Tref se co nejblíž cíli!
      </p>

      {debug && (
        <div className="mt-4 text-xs text-slate-500 grid grid-cols-2 gap-2">
          <div>running: {String(running)}</div>
          <div>countdownMs: {countdownMs}</div>
          <div>lastTickAt: {lastTickAt}</div>
          <div>progress: {progress.toFixed(3)}</div>
        </div>
      )}
    </section>
  );
}