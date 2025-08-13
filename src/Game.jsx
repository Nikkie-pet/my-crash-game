import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function Game() {
  const { t } = useTranslation();

  // KONSTANTY
  const MAX_TIME = 8000;
  const PERFECT_THR = 0.02;
  const GOOD_THR = 0.05;
  const RAMP_MAX_BOOST = 1.0;
  const STREAK_STEP = 0.10;
  const STREAK_CAP = 2.0;
  const QUOTA_TOTAL = 30;
  const QUOTA_WINDOW_HOURS = 12;
  const LS_QUOTA = "cg_quota";
  const LS = { points: "cg_points", bestError: "cg_best_error", history: "cg_history" };

  // STAVY
  const [phase, setPhase] = useState("idle");
  const [target, setTarget] = useState(1.78);
  const [value, setValue] = useState(1.00);
  const [result, setResult] = useState(null);
  const [speed, setSpeed] = useState(0.05);
  const [tick, setTick] = useState(22);
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

  const growRef = useRef(null);
  const elapsedRef = useRef(null);
  const audioCtxRef = useRef(null);

  // HELPERS
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

  // INIT persist & kvóta
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

  // Mute sync z App
  useEffect(() => {
    const onMute = (e) => setMuted(!!e.detail?.muted);
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  // START kola
  const startRound = () => {
    const now = Date.now();
    if (resetAt && now >= resetAt) {
      const nextReset = now + QUOTA_WINDOW_HOURS * 3600 * 1000;
      setPlaysLeft(QUOTA_TOTAL); setResetAt(nextReset);
      localStorage.setItem(LS_QUOTA, JSON.stringify({ playsLeft: QUOTA_TOTAL, resetAt: nextReset }));
    }
    if (playsLeft <= 0) { alert(t("alertQuota")); return; }

    const s = rand(0.045, 0.10);
    const tk = Math.floor(rand(14, 28, 0));
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
    setTarget(tgt);

    setValue(1.00); setElapsed(0); setResult(null); setPhase("ready");
  };

  // READY → RUN
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
      if (e >= MAX_TIME) {
        clearInterval(growRef.current); clearInterval(elapsedRef.current);
        const diff = Math.abs(value - target) + 0.15;
        finishRound(diff);
      }
    }, 50);
  };

  // STOP
  const stop = () => {
    if (phase !== "running") return;
    vibrate([20, 40, 20]); beep(420, 90, "sine");
    clearInterval(growRef.current); clearInterval(elapsedRef.current);
    const diff = Math.abs(value - target);
    finishRound(diff);
  };

  const finishRound = (diff) => {
    let runPoints = Math.max(0, Math.round(150 - diff * 300));
    let note = "OK";
    if (diff <= PERFECT_THR) {
      runPoints += 100; note = t("resultNotePerfect"); setStreak((s) => s + 1);
      vibrate([30,60,30]); beep(900,150,"triangle"); setTimeout(()=>beep(1200,120,"triangle"),120);
    } else if (diff <= GOOD_THR) {
      runPoints += 40; note = t("resultNoteGood"); setStreak((s) => s + 1); vibrate(30); beep(750,120,"sine");
    } else { note = t("resultNoteMiss"); setStreak(0); beep(220,120,"sine"); }

    const paceBonus = tick < 20 ? 1.2 : tick < 24 ? 1.1 : 1.0;
    runPoints = Math.round(runPoints * paceBonus);
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

  // hotkeys & cleanup
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

  useEffect(() => () => { clearInterval(growRef.current); clearInterval(elapsedRef.current); }, []);

  // UI
  return (
    <div className="grid gap-6">
      {/* info karta */}
      <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("title", { x: `${target.toFixed(2)}x` })}
            </h2>
            <p className="text-sm text-slate-500">{t("targetRange", { max: maxReach.toFixed(2) })}</p>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="text-right">
              <div>{t("points")}: <span className="font-semibold">{points}</span></div>
              <div>{t("streak")}: <span className="font-semibold">{streak}</span>
                <span className="text-slate-400"> (x{Math.min(1 + streak * STREAK_STEP, STREAK_CAP).toFixed(2)})</span>
              </div>
              <div className="text-slate-500">
                {t("bestErr")}: {bestError === Infinity ? "-" : bestError.toFixed(2)}
              </div>
              <div className="text-slate-500">
                {t("playsLeft")}: <span className="font-semibold">{playsLeft}</span>
                {resetAt && <> • {t("resetIn", { time: fmtTime(resetAt - Date.now()) })}</>}
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-600" checked={dailyMode} onChange={(e)=>setDailyMode(e.target.checked)} />
              <span className="text-sm">{t("daily")}</span>
            </label>
          </div>
        </div>
      </section>

      {/* ready/fáze */}
      {phase === "ready" ? (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6">
          <div className="text-center mb-4 text-xl font-semibold">{t("getReady")}</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <Info label={t("target")} value={`${target.toFixed(2)}x`} />
            <Info label={t("range")} value={`1.00–${maxReach.toFixed(2)}x`} />
            <Info label={t("baseSpeed")} value={`${speed.toFixed(3)}/tick`} />
            <Info label="Tick" value={`${tick}ms`} />
            <Info label="Ramp-up" value={`+${Math.round(RAMP_MAX_BOOST*100)}%`} />
            <Info label={t("timeLimit")} value={`${(MAX_TIME/1000).toFixed(0)}s`} />
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <Primary onClick={beginRunning}>{t("startNow")}</Primary>
            <Ghost onClick={() => setPhase("idle")}>{t("cancel")}</Ghost>
          </div>
        </section>
      ) : (
        <>
          {/* progress */}
          <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-2 bg-emerald-500 transition-[width] duration-75"
              style={{ width: `${Math.min((elapsed / MAX_TIME) * 100, 100)}%` }}
            />
          </div>

          {/* cifra */}
          <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-10 text-center">
            <div className={`text-7xl font-extrabold tracking-tight ${phase === "running" ? "animate-pulse" : ""}`}>
              {value.toFixed(2)}<span className="text-emerald-500">x</span>
            </div>
          </section>

          {/* ovládání */}
          <div className="flex justify-center gap-3">
            {(phase === "idle" || phase === "done") && <Primary onClick={startRound}>{t("startRound")}</Primary>}
            {phase === "running" && <Accent onClick={stop}>{t("stop")}</Accent>}
          </div>
        </>
      )}

      {/* výsledek */}
      {result && (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 text-center">
          <div className="text-sm text-slate-600">
            value <span className="font-mono">{result.value.toFixed(2)}x</span> • error <span className="font-mono">{result.diff.toFixed(2)}</span>
          </div>
          <div className="mt-1 font-semibold">
            {result.note} • +{result.runPoints} {t("points")} (streak x{result.streakMult.toFixed(2)})
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <Ghost onClick={startRound}>{t("startRound")}</Ghost>
          </div>
        </section>
      )}

      {/* žebříčky */}
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

      {/* historie */}
      {history.length > 0 && (
        <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6">
          <div className="font-semibold mb-3">{t("recentRuns")}</div>
          <ul className="text-xs text-slate-600 grid gap-1 max-h-40 overflow-auto pr-1">
            {history.map((r, i) => (
              <li key={r.ts + "_" + i} className="flex justify-between">
                <span>{new Date(r.ts).toLocaleTimeString()} • tgt {r.target.toFixed?.(2) ?? r.target} • val {r.value.toFixed?.(2) ?? r.value}</span>
                <span>err {r.diff.toFixed?.(2) ?? r.diff} • +{r.runPoints}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function Card({ title, empty, children }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6">
      <div className="font-semibold mb-3">{title}</div>
      {isEmpty ? <div className="text-sm text-slate-500">{empty}</div> : <ol className="text-sm grid gap-1">{children}</ol>}
    </section>
  );
}

function Row({ left, right }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-700">{left}</span>
      <span className="font-mono text-slate-900">{right}</span>
    </li>
  );
}

function Primary({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-5 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 active:scale-[.99] transition shadow-soft"
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
      className="px-5 py-3 rounded-xl bg-white border border-neutral-200 text-slate-900 hover:bg-neutral-100 active:scale-[.99] transition"
    >
      {children}
    </button>
  );
}