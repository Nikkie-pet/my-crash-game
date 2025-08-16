// src/Game.jsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/* ---------- Tooltip (bez knihoven) ---------- */
function Tooltip({ content, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className="absolute z-50 -top-2 left-1/2 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs rounded-lg bg-slate-900 text-white shadow-soft whitespace-nowrap dark:bg-slate-200 dark:text-slate-900">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-slate-900 dark:border-t-slate-200" />
        </div>
      )}
    </div>
  );
}

/* ---------- Drobné UI komponenty ---------- */
function Info({ label, value, hint }) {
  return (
    <Tooltip content={hint}>
      <div className="cursor-help rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center dark:bg-slate-800 dark:border-slate-700">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <div className="font-mono text-sm">{value}</div>
      </div>
    </Tooltip>
  );
}

function Card({ title, empty, children }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <div className="font-semibold mb-3">{title}</div>
      {isEmpty ? <div className="text-sm text-slate-500 dark:text-slate-400">{empty}</div> : <ol className="text-sm grid gap-1">{children}</ol>}
    </section>
  );
}

function Row({ left, right }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-700 dark:text-slate-200">{left}</span>
      <span className="font-mono text-slate-900 dark:text-white">{right}</span>
    </li>
  );
}

function Primary({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-5 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 active:scale-[.99] transition shadow-soft dark:bg-white dark:text-slate-900 dark:hover:bg-neutral-100"
    >
      {children}
    </button>
  );
}

function Accent({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-5 py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[.99] transition shadow-soft"
    >
      {children}
    </button>
  );
}

function Ghost({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-5 py-3 rounded-xl bg-white border border-neutral-200 text-slate-900 hover:bg-neutral-100 active:scale-[.99] transition dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

/* ---------- Hlavní komponenta hry ---------- */
export default function Game() {
  const { t, i18n } = useTranslation();

  // ===== hratelnější tempo =====
  const MAX_TIME = 12000;         // ms/kolo
  const PERFECT_THR = 0.02;
  const GOOD_THR = 0.05;
  const RAMP_MAX_BOOST = 0.6;

  // Streak násobení
  const STREAK_STEP = 0.10;
  const STREAK_CAP = 2.0;

  // Kvóta 30 her / 12 h
  const QUOTA_TOTAL = 30;
  const QUOTA_WINDOW_HOURS = 12;
  const LS_QUOTA = "cg_quota";

  // LocalStorage klíče
  const LS = { points: "cg_points", bestError: "cg_best_error", history: "cg_history" };

  // Obtížnosti
  const DIFFS = {
    easy:   { speedMin: 0.020, speedMax: 0.040, tickMin: 28, tickMax: 34 },
    normal: { speedMin: 0.030, speedMax: 0.050, tickMin: 26, tickMax: 32 },
    hard:   { speedMin: 0.040, speedMax: 0.060, tickMin: 24, tickMax: 30 }
  };

  // ===== Stavy =====
  const [phase, setPhase] = useState("idle");     // idle | ready | running | done
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem("cg_diff") || "easy");

  const [target, setTarget] = useState(1.78);
  const [value, setValue] = useState(1.00);
  const [displayValue, setDisplayValue] = useState(1.00);

  const [result, setResult] = useState(null);
  const [speed, setSpeed] = useState(0.03);
  const [tick, setTick] = useState(30);
  const [elapsed, setElapsed] = useState(0);
  const [maxReach, setMaxReach] = useState(1.00);

  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestError, setBestError] = useState(Infinity);
  const [history, setHistory] = useState([]);
  const [topRuns, setTopRuns] = useState([]);
  const [topPrecision, setTopPrecision] = useState([]);

  const [dailyMode, setDailyMode] = useState(false);
  const [playsLeft, setPlaysLeft] = useState(QUOTA_TOTAL);
  const [resetAt, setResetAt] = useState(null);

  const [muted, setMuted] = useState(() => localStorage.getItem("muted") === "1");

  // Timery / refy
  const growRef = useRef(null);
  const elapsedRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  // Multiplayer: maxTime pro aktuální kolo (host může poslat jinou hodnotu)
  const mpMaxTimeRef = useRef(MAX_TIME);

  // ===== Helpers =====
  const rand = (min, max, d = 3) => Number((Math.random() * (max - min) + min).toFixed(d));

  const computeMaxReach = (base = 1.0, s, tickMs, maxMs) => {
    let v = base;
    for (let t = 0; t < maxMs; t += tickMs) {
      const ramp = 1 + Math.min(t / 4000, RAMP_MAX_BOOST);
      v = +(v + s * ramp).toFixed(2);
    }
    return Number(v.toFixed(2));
  };

  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${h}h ${m}m ${ss}s`;
  };

  const vibrate = (pattern = 20) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {} };

  // Zvuk
  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return audioCtxRef.current;
  };
  const beep = (freq = 600, dur = 120, type = "sine", vol = 0.03) => {
    if (muted) return;
    const ctx = ensureAudioCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; g.gain.value = vol;
    osc.connect(g); g.connect(ctx.destination); osc.start();
    setTimeout(() => { try { osc.stop(); osc.disconnect(); g.disconnect(); } catch {} }, dur);
  };

  // ===== Init persist & kvóta =====
  useEffect(() => {
    const p = Number(localStorage.getItem(LS.points) || 0); if (!Number.isNaN(p)) setPoints(p);
    const be = Number(localStorage.getItem(LS.bestError) || Infinity); if (!Number.isNaN(be)) setBestError(be);
    const hist = JSON.parse(localStorage.getItem(LS.history) || "[]"); if (Array.isArray(hist)) setHistory(hist);

    const saved = JSON.parse(localStorage.getItem(LS_QUOTA) || "null");
    const now = Date.now();
    if (saved && saved.resetAt && now < saved.resetAt) {
      setPlaysLeft(saved.playsLeft); setResetAt(saved.resetAt);
    } else {
      const nextReset = now + QUOTA_WINDOW_HOURS * 3600 * 1000;
      const init = { playsLeft: QUOTA_TOTAL, resetAt: nextReset };
      localStorage.setItem(LS_QUOTA, JSON.stringify(init));
      setPlaysLeft(QUOTA_TOTAL); setResetAt(nextReset);
    }
  }, []);

  // ===== Mute sync z App.jsx =====
  useEffect(() => {
    const onMute = (e) => setMuted(!!e.detail?.muted);
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // ===== Inertie (displayValue plynule dohání value) =====
  useEffect(() => {
    const INERTIA = 0.18;
    const tick = () => {
      setDisplayValue((d) => {
        const diff = value - d;
        if (Math.abs(diff) < 0.001) return value;
        return d + diff * INERTIA;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  // ===== Multiplayer: start kola se sdílenými parametry =====
  useEffect(() => {
    const onMpRound = (e) => {
      const { seed, tick: tk, speed: spd, maxTime } = e.detail || {};
      if (!tk || !spd) return;

      const MAX = Number(maxTime || 12000);
      mpMaxTimeRef.current = MAX;

      setSpeed(Number(spd));
      setTick(Number(tk));

      const maxV = computeMaxReach(1.0, Number(spd), Number(tk), MAX);
      setMaxReach(maxV);

      // deterministický target ze seed
      const rng = (() => {
        let s = Number(seed) % 2147483647;
        return () => (s = (s * 48271) % 2147483647) / 2147483647;
      })();
      const tgt = Number((1 + rng() * (maxV - 1)).toFixed(2));
      setTarget(tgt);

      setValue(1.00);
      setDisplayValue(1.00);
      setElapsed(0);
      setResult(null);
      setPhase("ready");

      setTimeout(() => beginRunning(), 600);
    };

    window.addEventListener("cg-mp-round", onMpRound);
    return () => window.removeEventListener("cg-mp-round", onMpRound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Start kola (solo) =====
  const startRound = () => {
    const now = Date.now();
    if (resetAt && now >= resetAt) {
      const nextReset = now + QUOTA_WINDOW_HOURS * 3600 * 1000;
      setPlaysLeft(QUOTA_TOTAL); setResetAt(nextReset);
      localStorage.setItem(LS_QUOTA, JSON.stringify({ playsLeft: QUOTA_TOTAL, resetAt: nextReset }));
    }
    if (playsLeft <= 0) { alert(t("alertQuota")); return; }

    const d = DIFFS[difficulty] || DIFFS.easy;
    const s = rand(d.speedMin, d.speedMax);
    const tk = Math.floor(rand(d.tickMin, d.tickMax, 0));
    setSpeed(s); setTick(tk);

    const maxV = computeMaxReach(1.0, s, tk, MAX_TIME);
    setMaxReach(maxV);

    const todayKey = new Date().toISOString().slice(0, 10);
    const seededBetween = (min, max) => {
      const seed = Array.from(todayKey).reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const rng = (seed % 10000) / 10000;
      return Number((min + rng * (max - min)).toFixed(2));
    };
    const tgt = dailyMode
      ? Math.max(1, Math.min(maxV, seededBetween(1.0, maxV)))
      : Number((1 + Math.random() * (maxV - 1)).toFixed(2));

    mpMaxTimeRef.current = MAX_TIME; // solo režim

    setTarget(tgt);
    setValue(1.00); setDisplayValue(1.00);
    setElapsed(0); setResult(null);
    setPhase("ready");
  };

  // ===== Ready → Running =====
  const beginRunning = () => {
    setPlaysLeft((n) => {
      const next = Math.max(0, n - 1);
      localStorage.setItem(LS_QUOTA, JSON.stringify({ playsLeft: next, resetAt }));
      return next;
    });

    vibrate(10); beep(520, 80, "square");
    setPhase("running");
    const startedAt = performance.now();

    growRef.current = setInterval(() => {
      const e = performance.now() - startedAt;
      const ramp = 1 + Math.min(e / 4000, RAMP_MAX_BOOST);
      setValue((v) => +(v + speed * ramp).toFixed(2));
    }, tick);

    elapsedRef.current = setInterval(() => {
      const e = performance.now() - startedAt;
      setElapsed(e);
      if (e >= mpMaxTimeRef.current) {
        clearInterval(growRef.current); clearInterval(elapsedRef.current);
        const diff = Math.abs(value - target) + 0.15;
        finishRound(diff);
      }
    }, 50);
  };

  // ===== STOP =====
  const stop = () => {
    if (phase !== "running") return;
    vibrate([20, 40, 20]); beep(420, 90, "sine");
    clearInterval(growRef.current); clearInterval(elapsedRef.current);
    const diff = Math.abs(value - target);
    finishRound(diff);
  };

  // Sdílení výsledku
  const shareResult = async (res) => {
    const text = `I hit ${value.toFixed(2)}x vs target ${target.toFixed(2)}x (err ${res.diff.toFixed(2)}) — score +${res.runPoints}. Try it: ${location.href}`;
    try {
      if (navigator.share) await navigator.share({ title: "Crash Aim", text, url: location.href });
      else { await navigator.clipboard.writeText(text); alert("Result copied to clipboard!"); }
    } catch {
      try { await navigator.clipboard.writeText(text); alert("Result copied to clipboard!"); } catch {}
    }
  };

  // ===== Vyhodnocení =====
  const finishRound = (diff) => {
    let runPoints = Math.max(0, Math.round(150 - diff * 300));
    let note = "OK";

    if (diff <= PERFECT_THR) {
      runPoints += 100; note = t("resultNotePerfect"); setStreak((s) => s + 1);
      vibrate([30,60,30]); beep(900,150,"triangle"); setTimeout(()=>beep(1200,120,"triangle"),120);
    } else if (diff <= GOOD_THR) {
      runPoints += 40; note = t("resultNoteGood"); setStreak((s) => s + 1); vibrate(30); beep(750,120,"sine");
    } else {
      note = t("resultNoteMiss"); setStreak(0); beep(220,120,"sine");
    }

    const futureStreak = diff <= GOOD_THR ? streak + 1 : 0;
    const streakMult = Math.min(1 + futureStreak * STREAK_STEP, STREAK_CAP);
    runPoints = Math.round(runPoints * streakMult);

    setPoints((p) => { const np = p + runPoints; localStorage.setItem(LS.points, String(np)); return np; });
    setBestError((prev) => { const next = Math.min(prev, diff); localStorage.setItem(LS.bestError, String(next)); return next; });

    const entry = { ts: Date.now(), target, value, diff: +diff.toFixed(2), runPoints, tick, speed: +speed.toFixed(3), maxReach };
    setHistory((h) => { const next = [entry, ...h].slice(0, 10); localStorage.setItem(LS.history, JSON.stringify(next)); return next; });
    setTopRuns((a) => [...a, entry].sort((x,y)=>y.runPoints-x.runPoints).slice(0,5));
    setTopPrecision((a) => [...a, entry].sort((x,y)=>x.diff-y.diff).slice(0,5));

    setResult({ value, diff, runPoints, note, speed, tick, maxReach, elapsed: Math.round(elapsed), streakMult });
    setPhase("done");
  };

  // ===== Hotkeys =====
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (e.key === "Enter") {
        if (phase === "idle" || phase === "done") startRound();
        else if (phase === "ready") beginRunning();
      }
      if (e.key === " ") {
        if (phase === "running") { e.preventDefault(); stop(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // cleanup
  useEffect(() => {
    return () => {
      clearInterval(growRef.current);
      clearInterval(elapsedRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ===== Lokalizované „pravidla“ =====
  const rules = i18n.language?.startsWith("cs")
    ? {
        title: "📜 Pravidla",
        goal: "Cíl: Zastav multiplikátor co nejblíže k cíli (např. 2.13x vs 2.15x).",
        controls: "Ovládání: ⏎ Enter = Start/Confirm, Space = Stop. Nebo tlačítka Start/Stop.",
        scoring: "Bodování: Čím menší chyba, tím více bodů. Perfect (≤ 0.02) dává bonus a zvyšuje streak.",
        tip: "Tip: Sleduj tempo růstu (base speed + ramp-up). Na Easy je růst pomalejší."
      }
    : {
        title: "📜 Rules",
        goal: "Goal: Stop the multiplier as close to the target as possible (e.g. 2.13x vs 2.15x).",
        controls: "Controls: ⏎ Enter = Start/Confirm, Space = Stop. Or use Start/Stop buttons.",
        scoring: "Scoring: The smaller the error, the more points. Perfect (≤ 0.02) adds a bonus and increases streak.",
        tip: "Tip: Watch growth pace (base speed + ramp-up). Easy grows slower."
      };

  // ===== UI =====
  return (
    <div className="grid gap-6">
      {/* info karta */}
      <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("title", { x: `${target.toFixed(2)}x` })}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("targetRange", { max: maxReach.toFixed(2) })}</p>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="text-right">
              <div>{t("points")}: <span className="font-semibold">{points}</span></div>
              <div>
                {t("streak")}: <span className="font-semibold">{streak}</span>{" "}
                <span className="text-slate-400"> (x{Math.min(1 + streak * STREAK_STEP, STREAK_CAP).toFixed(2)})</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {t("bestErr")}: {bestError === Infinity ? "-" : bestError.toFixed(2)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {t("playsLeft")}: <span className="font-semibold">{playsLeft}</span>
                {resetAt && <> • {t("resetIn", { time: fmtTime(resetAt - Date.now()) })}</>}
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-600" checked={dailyMode} onChange={(e)=>setDailyMode(e.target.checked)} />
              <span className="text-sm"> {t("daily")} </span>
            </label>
          </div>
        </div>
      </section>

      {/* volba obtížnosti */}
      <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-4 flex items-center justify-between gap-3 text-sm dark:bg-slate-900 dark:border-slate-800">
        <div className="font-medium">Difficulty</div>
        <div className="flex gap-2">
          {["easy","normal","hard"].map((d) => (
            <button
              key={d}
              onClick={() => { setDifficulty(d); localStorage.setItem("cg_diff", d); }}
              className={`px-3 py-1.5 rounded-lg border transition ${
                difficulty === d
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-white border-neutral-200 text-slate-900 hover:bg-neutral-100 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {/* READY / PARAMETRY + tooltipy */}
      {phase === "ready" ? (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
          <div className="text-center mb-4 text-xl font-semibold">{t("getReady")}</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <Info label={t("target")} value={`${target.toFixed(2)}x`} hint={i18n.language?.startsWith("cs") ? "Požadovaná hodnota násobiče pro ideální zásah." : "Target multiplier for a perfect hit."} />
            <Info label={t("range")} value={`1.00–${maxReach.toFixed(2)}x`} hint={i18n.language?.startsWith("cs") ? "Teoretický rozsah dosažitelný v tomto kole." : "Theoretical reachable range for this round."} />
            <Info label={t("baseSpeed")} value={`${speed.toFixed(3)}/tick`} hint={i18n.language?.startsWith("cs") ? "Základní tempo růstu. Zrychluje se ramp-upem." : "Base growth pace, accelerates with ramp-up."} />
            <Info label="Tick" value={`${tick}ms`} hint={i18n.language?.startsWith("cs") ? "Jak často se hodnota přepočítá. Vyšší = pomalejší." : "How often value updates. Higher = slower."} />
            <Info label="Ramp-up" value={`+${Math.round(RAMP_MAX_BOOST*100)}%`} hint={i18n.language?.startsWith("cs") ? "Postupné zrychlování v průběhu kola." : "Gradual acceleration during the round."} />
            <Info label={t("timeLimit")} value={`${(mpMaxTimeRef.current/1000).toFixed(0)}s`} hint={i18n.language?.startsWith("cs") ? "Po limitu se kolo ukončí s penalizací." : "After limit, the round ends with a penalty."} />
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <Primary onClick={beginRunning}>{t("startNow")}</Primary>
            <Ghost onClick={() => setPhase("idle")}>{t("cancel")}</Ghost>
          </div>
        </section>
      ) : (
        <>
          {/* PROGRESS */}
          <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden dark:bg-slate-800">
            <div
              className="h-2 bg-emerald-500 transition-[width] duration-75"
              style={{ width: `${Math.min((elapsed / mpMaxTimeRef.current) * 100, 100)}%` }}
            />
          </div>

          {/* ZOBRAZENÁ HODNOTA (inertní) */}
          <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-10 text-center dark:bg-slate-900 dark:border-slate-800">
            <div className={`text-7xl font-extrabold tracking-tight ${phase === "running" ? "animate-pulse" : ""}`}>
              {displayValue.toFixed(2)}<span className="text-emerald-500">x</span>
            </div>
          </section>

          {/* OVLÁDÁNÍ */}
          <div className="flex justify-center gap-3">
            {(phase === "idle" || phase === "done") && <Primary onClick={startRound}>{t("startRound")}</Primary>}
            {phase === "running" && <Accent onClick={stop}>{t("stop")}</Accent>}
          </div>
        </>
      )}

      {/* VÝSLEDEK */}
      {result && (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 text-center dark:bg-slate-900 dark:border-slate-800">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            value <span className="font-mono">{result.value.toFixed(2)}x</span> • error <span className="font-mono">{result.diff.toFixed(2)}</span>
          </div>
          <div className="mt-1 font-semibold">
            {result.note} • +{result.runPoints} {t("points")} (streak x{result.streakMult.toFixed(2)})
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <Ghost onClick={startRound}>{t("startRound")}</Ghost>
            <Ghost onClick={() => shareResult(result)}>Share</Ghost>
          </div>
        </section>
      )}

      {/* ŽEBŘÍČKY */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title={t("topRuns")} empty={t("noRunsYet")}>
          {topRuns.map((r, i) => (
            <Row key={`rp_${i}`} left={`#${i+1} • tgt ${r.target.toFixed(2)} • val ${r.value.toFixed(2)}`} right={`+${r.runPoints} pts`} />
          ))}
        </Card>
        <Card title={t("topPrecision")} empty={t("noRunsYet")}>
          {topPrecision.map((r, i) => (
            <Row key={`pr_${i}`} left={`#${i+1} • tgt ${r.target.toFixed(2)} • val ${r.value.toFixed(2)}`} right={`err ${r.diff.toFixed(2)}`} />
          ))}
        </Card>
      </div>

      {/* HISTORIE */}
      {history.length > 0 && (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
          <div className="font-semibold mb-3">{t("recentRuns")}</div>
          <ul className="text-xs text-slate-600 dark:text-slate-300 grid gap-1 max-h-40 overflow-auto pr-1">
            {history.map((r, i) => (
              <li key={r.ts + "_" + i} className="flex justify-between">
                <span>{new Date(r.ts).toLocaleTimeString()} • tgt {r.target.toFixed?.(2) ?? r.target} • val {r.value.toFixed?.(2) ?? r.value}</span>
                <span>err {r.diff.toFixed?.(2) ?? r.diff} • +{r.runPoints}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PRAVIDLA – sticky spodní panel */}
      <div className="sticky bottom-3 z-40">
        <section className="mx-auto max-w-3xl rounded-2xl bg-white shadow-soft border border-neutral-200 p-4 dark:bg-slate-900 dark:border-slate-800">
          <div className="text-sm font-semibold mb-1">{rules.title}</div>
          <ul className="text-xs text-slate-700 dark:text-slate-300 grid gap-1">
            <li>• {rules.goal}</li>
            <li>• {rules.controls}</li>
            <li>• {rules.scoring}</li>
            <li>• {rules.tip}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}