// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);       // aktuální hodnota (×)
  const [target, setTarget] = useState(1.5);     // cíl (×) – v MP přichází z payloadu
  const [tick, setTick] = useState(30);          // FPS (pouze informativní)
  const [speed, setSpeed] = useState(0.04);      // tempo růstu
  const [maxTime, setMaxTime] = useState(12000); // ms
  const [countdown, setCountdown] = useState(0); // ms do startu (sync v MP)
  const [roundId, setRoundId] = useState(null);

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
      const tk = Number(p.tick ?? 30);
      const sp = Number(p.speed ?? 0.04);
      const mt = Number(p.maxTime ?? 12000);
      const sa = Number(p.startAt ?? Date.now() + 2000);

      // nastavení parametrů
      setTarget(clamp(t, 1.0, 999));
      setTick(clamp(tk, 10, 120));
      setSpeed(clamp(sp, 0.005, 0.2));
      setMaxTime(clamp(mt, 3000, 60000));
      setValue(1.0);
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
      // jemné „píp“ pro 3,2,1. Pro 0 ne, to je start.
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
    // hned spočítej stav a pak po 100ms
    tickFn();
    countdownTimerRef.current = setInterval(tickFn, 100);
  };

  const startRun = () => {
    setValue(1.0);
    setRunning(true);
    startTimeRef.current = Date.now();
    loop();
  };

  const stopRun = () => {
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
    reportResult();
  };

  const loop = () => {
    if (!running) return;
    const elapsed = Date.now() - startTimeRef.current;

    // jednoduchý růst – lineární vizuální tempo řízené `speed`
    const next = 1.0 + (elapsed / (1000 / speed));
    setValue(next);

    if (elapsed >= maxTime) {
      // „crash“ – konec kola bez kliknutí
      setRunning(false);
      reportResult(true);
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  };

  const handleClick = () => {
    if (countdown > 0) return; // během odpočtu nelze startovat
    if (!running) {
      // SOLO režim: nastavíme 3s odpočet a start
      const soloTarget = Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2));
      const sa = Date.now() + 3000;
      setTarget(soloTarget);
      setTick(30);
      setSpeed(0.04);
      setMaxTime(12000);
      setRoundId(Date.now());
      setValue(1.0);
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
      target: t, // posíláme přesně ten target, který všichni viděli
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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Crash Aim</h2>
        <div className="text-sm text-slate-500">{secondsLabel}</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Field label="Cíl (×)">
          <strong className="text-2xl">{target.toFixed(2)}</strong>
        </Field>
        <Field label="Hodnota (×)">
          <span className="text-xl">{value.toFixed(2)}</span>
        </Field>
        <Field label="Rychlost">
          <span className="text-sm">{speed}</span>
        </Field>
        <Field label="FPS">
          <span className="text-sm">{tick}</span>
        </Field>
      </div>

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
        Space / Enter – Start/Stop. Cílem je trefit se co nejblíž hodnotě „Cíl“.
      </p>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-slate-800/50 border border-neutral-200 dark:border-slate-700">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}