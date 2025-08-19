// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);
  const [target, setTarget] = useState(1.5);
  const [maxTime, setMaxTime] = useState(8000);   // ms
  const [maxMult, setMaxMult] = useState(4.5);    // ×
  const [countdownMs, setCountdownMs] = useState(0);
  const [roundId, setRoundId] = useState(null);
  const [progress, setProgress] = useState(0);

  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const cdownRef = useRef(null);
  const lastBeepSecRef = useRef(null);

  // MUTE sync
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // příjem MP payloadu
  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const mm = clamp(Number(p.maxMult ?? 4.5), 1.05, 50.0);
      const mt = clamp(Number(p.maxTime ?? 8000), 3000, 60000);
      const t  = clamp(Number(p.target ?? 1.5), 1.05, mm - 0.01); // nikdy ne nad stropem
      const sa = Number(p.startAt ?? Date.now() + 2000);

      stopAll();
      setMaxMult(mm);
      setMaxTime(mt);
      setTarget(t);
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

  // klávesy
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); handleClick(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, countdownMs]);

  // beep při 3·2·1
  useEffect(() => {
    if (countdownMs <= 0) return;
    const secLeft = Math.ceil(countdownMs / 1000);
    if (secLeft !== lastBeepSecRef.current) {
      lastBeepSecRef.current = secLeft;
      if (!mutedRef.current && secLeft > 0) {
        try {
          new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play();
        } catch {}
      }
    }
  }, [countdownMs]);

  const stopAll = () => {
    try { clearInterval(cdownRef.current); } catch {}
    try { cancelAnimationFrame(rafRef.current); } catch {}
    cdownRef.current = null;
    rafRef.current = null;
  };

  const beginCountdownTo = (startAtTs) => {
    stopAll();
    const tick = () => {
      const rest = Math.max(0, startAtTs - Date.now());
      setCountdownMs(rest);
      if (rest <= 0) {
        clearInterval(cdownRef.current);
        cdownRef.current = null;
        startRun();
      }
    };
    tick();
    cdownRef.current = setInterval(tick, 100);
  };

  const startRun = () => {
    setRunning(true);
    setValue(1.0);
    setProgress(0);
    startTimeRef.current = Date.now();
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopRun = () => {
    if (!running) return;
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // zajistíme přesnost: dorovnej poslední zobrazenou hodnotu
    setValue((v) => Number(v.toFixed(2)));
    reportResult();
  };

  const loop = () => {
    if (!running) return;
    const elapsed = Date.now() - startTimeRef.current;

    const t = clamp(elapsed / maxTime, 0, 1);       // 0..1
    setProgress(t);

    // 🔹 LINEÁRNĚ z 1.00× → maxMult přesně během maxTime
    const next = 1.0 + (maxMult - 1.0) * t;
    setValue(next);

    if (elapsed >= maxTime) {
      // garantuj přesný strop (zobrazení i vyhodnocení)
      setValue(1.0 + (maxMult - 1.0) * 1);
      setRunning(false);
      reportResult(true); // „crash“ (neklikl)
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  };

  const handleClick = () => {
    if (countdownMs > 0) return;
    if (!running) {
      // SOLO – rychlá příprava dosažitelných parametrů
      const mm = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
      const mt = 8000;
      const targetMax = Math.max(1.10, mm - 0.05);
      const t  = Number((1.10 + Math.random() * (targetMax - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;

      stopAll();
      setMaxMult(mm);
      setMaxTime(mt);
      setTarget(t);
      setValue(1.0);
      setProgress(0);
      setRoundId(Date.now());
      beginCountdownTo(sa);
      toast(`Solo kolo – cíl ${t.toFixed(2)}×`, "info");
    } else {
      stopRun();
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

  useEffect(() => () => stopAll(), []);

  const secondsLabel =
    countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : running ? "Běží…" : "Připraveno";
  const targetPos = clamp((target - 1.0) / Math.max(0.001, (maxMult - 1.0)), 0, 1);

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

      <div className="mt-6">
        <button
          onClick={handleClick}
          disabled={countdownMs > 0}
          className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title={countdownMs > 0 ? "Běží odpočet – počkej na start" : ""}
        >
          {running ? "Stop" : countdownMs > 0 ? `Start za ${(countdownMs / 1000).toFixed(1)} s` : "Start"}
        </button>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Hodnota roste **lineárně** z 1.00× až na {maxMult.toFixed(2)}× během {(maxTime/1000).toFixed(0)} s.
        Oranžová čára je cílová hodnota (vždy ≤ strop). Space / Enter – Start/Stop.
      </p>
    </section>
  );
}