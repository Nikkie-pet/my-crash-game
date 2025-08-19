// src/Game.jsx
import React, { useEffect, useRef, useState } from "react";
import { toast } from "./components/Toasts";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Game() {
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState(1.0);       // aktuální „násobek“
  const [target, setTarget] = useState(1.5);     // cíl (může přijít z MP payloadu)
  const [tick, setTick] = useState(30);          // FPS (interval ms ~ 1000/tick)
  const [speed, setSpeed] = useState(0.04);      // tempo růstu hodnoty za tick
  const [maxTime, setMaxTime] = useState(12000); // ms
  const [countdown, setCountdown] = useState(0); // ms do startu (sync v MP)
  const [roundId, setRoundId] = useState(null);

  const mutedRef = useRef(localStorage.getItem("muted") === "1");
  const rafRef = useRef(null);
  const startAtRef = useRef(0);
  const startTimeRef = useRef(0);

  // zvuk on/off
  useEffect(() => {
    const onMute = (e) => { mutedRef.current = !!e.detail?.muted; };
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // posluchač MP payloadu
  useEffect(() => {
    const onRound = (e) => {
      const p = e.detail || {};
      const t = Number(p.target ?? 1.5); // ← ← přeber target z payloadu (klíčové)
      const tk = Number(p.tick ?? 30);
      const sp = Number(p.speed ?? 0.04);
      const mt = Number(p.maxTime ?? 12000);
      const sa = Number(p.startAt ?? Date.now() + 2000);
      setTarget(clamp(t, 1.0, 999));
      setTick(clamp(tk, 10, 120));
      setSpeed(clamp(sp, 0.005, 0.2));
      setMaxTime(clamp(mt, 3000, 60000));
      setValue(1.0);
      setRunning(false);
      setRoundId(p.seed || sa);
      // odpočet do společného startu
      startAtRef.current = sa;
      setCountdown(Math.max(0, sa - Date.now()));
      // počkáme do startu a spustíme
      scheduleStartAt(sa);
      toast(`Nové kolo – cíl ${t.toFixed(2)}×`, "info");
    };
    window.addEventListener("cg-mp-round", onRound);
    return () => window.removeEventListener("cg-mp-round", onRound);
  }, []);

  // keyboard – Space/Enter start/stop
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  const scheduleStartAt = (ts) => {
    const delay = Math.max(0, ts - Date.now());
    if (delay < 5) {
      startRun();
      return;
    }
    setTimeout(() => startRun(), delay);
    // vizuální odpočet
    const id = setInterval(() => {
      const rest = Math.max(0, ts - Date.now());
      setCountdown(rest);
      if (rest <= 0) clearInterval(id);
    }, 100);
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
    // jednoduchý růst – lineární o speed za tick (~rychlost je „vizuální“ parametr)
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
    if (countdown > 0) return; // ještě neodstartovalo
    if (!running) {
      // sólo test (mimo MP) – vytvoří lokální cíle a parametry
      const soloTarget = Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2));
      setTarget(soloTarget);
      setTick(30);
      setSpeed(0.04);
      setMaxTime(12000);
      setRoundId(Date.now());
      setValue(1.0);
      setCountdown(0);
      startRun();
      toast(`Solo kolo – cíl ${soloTarget.toFixed(2)}×`, "info");
    } else {
      stopRun();
    }
  };

  const reportResult = (crashed = false) => {
    const name = (localStorage.getItem("mp_name") || "Player").trim();
    const v = Number(value);
    const t = Number(target);
    // skóre – čím blíž k cíli, tím lépe, přesnost na dvě desetiny
    const diff = Math.abs(v - t);
    const score = Math.max(0, Math.round((1000 - diff * 1000)));

    const payload = {
      name,
      value: v,
      target: t,     // ← posíláme přesně ten target, který všichni viděli
      score,
      crashed: !!crashed,
      ts: Date.now(),
      roundId,
    };

    window.dispatchEvent(new CustomEvent("cg-game-result", { detail: payload }));
    if (!mutedRef.current) {
      try {
        // jednoduché „píp“ podle úspěchu
        new Audio(
          score > 900
            ? "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
            : "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
        ).play();
      } catch {}
    }
  };

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Crash Aim</h2>
        <div className="text-sm text-slate-500">
          {countdown > 0 ? `Start za ${(countdown / 1000).toFixed(1)}s` : running ? "Běží…" : "Připraveno"}
        </div>
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
        >
          {running ? "Stop" : "Start"}
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