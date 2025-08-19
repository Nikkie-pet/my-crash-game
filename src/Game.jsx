// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);       // aktuální hodnota (×)
  const [target, setTarget] = useState(1.5);     // cíl (×) – v MP přichází z payloadu
  const [speed, setSpeed] = useState(0.04);      // tempo růstu (vizuální parametr)
  const [maxTime, setMaxTime] = useState(12000); // ms
  const [countdown, setCountdown] = useState(0); // ms do startu (sync v MP)
  const [roundId, setRoundId] = useState(null);

  // Vizualizace průběhu času 0..1
  const [progress, setProgress] = useState(0);

  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const countdownTimerRef = useRef(null);
  const lastBeepSecRef = useRef(null);

  // zvuk on/off (z App.jsx)
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // příchod MP kola (sdílené parametry vč. targetu + startAt)
  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const t = Number(p.target ?? 1.5);
      const sp = Number(p.speed ?? 0.04);
      const mt = Number(p.maxTime ?? 12000);
      const sa = Number(p.startAt ?? Date.now() + 2000);

      // nastavení parametrů
      setTarget(clamp(t, 1.0, 999));
      setSpeed(clamp(sp, 0.005, 0.2));
      setMaxTime(clamp(mt, 3000, 60000));
      setValue(1.0);
      setProgress(0);
      setRunning(false);
      setRoundId(p.seed || sa);

      // spustíme synchronizovaný odpočet
      beginCountdownTo(sa);
      toast(`Nové kolo – cíl ${t.toFixed(2)}×`, "info");
    };
    window.addEventListener("cg-mp-round", onRound);
    return () => window.removeEventListener("cg-mp-round", onRound);
  }, []);

  // klávesy: Space/Enter = Start/Stop
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, countdown]);

  // Vizuální + zvukový odpočet (3·2·1)
  useEffect(() => {
    if (countdown <= 0) return;
    const secLeft = Math.ceil(countdown / 1000);
    if (secLeft !== lastBeepSecRef.current) {
      lastBeepSecRef.current = secLeft;
      beep(secLeft);
    }
  }, [countdown]);

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
    clearInterval(countdownTimerRef.current);
    const tickFn = () => {
      const rest = Math.max(0, startAtTs - Date.now());
      setCountdown(rest);
      if (rest <= 0) {
        clearInterval(countdownTimerRef.current);
        startRun();
      }
    };
    tickFn();
    countdownTimerRef.current = setInterval(tickFn, 100);
  };

  const startRun = () => {
    setValue(1.0);
    setProgress(0);
    setRunning(true);
    startTimeRef.current = Date.now();
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopRun = () => {
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
    reportResult();
  };

  const loop = () => {
    if (!running) return;
    const elapsed = Date.now() - startTimeRef.current;

    // Vizualizace času: 0..1
    const p = clamp(elapsed / maxTime, 0, 1);
    setProgress(p);

    // Vizuální růst hodnoty (jednoduchá lineární křivka vůči času a "speed")
    const next = 1.0 + (elapsed / (1000 / speed));
    setValue(next);

    if (elapsed >= maxTime) {
      setRunning(false);
      reportResult(true); // „crash“ – bez kliknutí
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  };

  const handleClick = () => {
    if (countdown > 0) return; // během odpočtu nelze startovat
    if (!running) {
      // SOLO režim: nastavíme společně s odpočtem
      const soloTarget = Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;
      setTarget(soloTarget);
      setSpeed(0.04);
      setMaxTime(12000);
      setRoundId(Date.now());
      setValue(1.0);
      setProgress(0);
      beginCountdownTo(sa);
      toast(`Solo kolo – cíl ${soloTarget.toFixed(2)}×`, "info");
    } else {
      stopRun();
    }
  };

  const reportResult = (crashed = false) => {
    const name = (localStorage.getItem("mp_name") || "Player").trim();
    const v = Number(value);
    const t = Number(target);
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round((1000 - diff * 1000)));

    const payload = {
      name,
      value: v,
      target: t, // přesně ten target, který všichni viděli
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

  const secondsLabel =
    countdown > 0 ? `Start za ${(countdown / 1000).toFixed(1)} s` : running ? "Běží…" : "Připraveno";

  // pro vykreslení „target markeru“ v rámci hodnotové osy
  // odhad horního limitu osy: 1.0 → hodnota při maxTime s aktuální speed
  const estimatedMaxValue = 1.0 + (maxTime / (1000 / speed));
  const targetPos = clamp((target - 1.0) / (estimatedMaxValue - 1.0), 0, 1);

  return (
    <section className="relative rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
      {/* Velký 3·2·1 overlay */}
      {countdown > 0 && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
          <div className="text-white text-7xl md:text-8xl font-extrabold drop-shadow">
            {Math.max(1, Math.ceil(countdown / 1000))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Crash Aim</h2>
        <div className="text-sm text-slate-500">{secondsLabel}</div>
      </div>

      {/* Velká „živá“ hodnota */}
      <div className="mt-4 flex items-end gap-4">
        <div className="text-5xl md:text-6xl font-extrabold tabular-nums tracking-tight">
          {value.toFixed(2)}×
        </div>
        <div className="text-slate-500">
          <div className="text-xs">Cíl</div>
          <div className="text-xl font-semibold">{target.toFixed(2)}×</div>
        </div>
      </div>

      {/* Hodnotová osa s markerem cíle */}
      <div className="relative mt-5 h-4 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700 overflow-hidden">
        {/* „Spark“ – tečka ukazující průběh času (0..1) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 transition-[left] duration-100"
          style={{ left: `${progress * 100}%` }}
        />
        {/* cíl – svislý marker */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-amber-500/80"
          style={{ left: `${targetPos * 100}%` }}
          title={`Cíl ${target.toFixed(2)}×`}
        />
        {/* jemná výplň za sparkem */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200/40 dark:bg-emerald-900/30 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
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
          disabled={countdown > 0}
          className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title={countdown > 0 ? "Běží odpočet – počkej na start" : ""}
        >
          {running ? "Stop" : countdown > 0 ? `Start za ${(countdown / 1000).toFixed(1)} s` : "Start"}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Space / Enter – Start/Stop. Sleduj horní velkou hodnotu (×), časová lišta ukazuje průběh kola.
        Svislá oranžová čára je cílová hodnota. Tref se co nejblíž cíli!
      </p>
    </section>
  );
}