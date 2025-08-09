import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Game() {
  const { t } = useTranslation();

  // ====== KONSTANTY ======
  const MAX_TIME = 8000;            // ms
  const PERFECT_THR = 0.02;
  const GOOD_THR = 0.05;
  const RAMP_MAX_BOOST = 1.0;       // až +100 % během kola

  // Streak multiplikátor
  const STREAK_STEP = 0.10;         // +10 % za GOOD/PERFECT
  const STREAK_CAP = 2.0;           // cap x2

  // Kvóta 30 her / 12 h
  const QUOTA_TOTAL = 30;
  const QUOTA_WINDOW_HOURS = 12;
  const LS_QUOTA = "cg_quota";

  // Persist klíče
  const LS = {
    points: "cg_points",
    bestError: "cg_best_error",
    history: "cg_history",
  };

  // ====== STAV ======
  const [phase, setPhase] = useState("idle");  // idle | ready | running | done
  const [target, setTarget] = useState(1.78);
  const [value, setValue] = useState(1.00);
  const [result, setResult] = useState(null);

  // tempo runu
  const [speed, setSpeed] = useState(0.05);   // přírůstek / tick
  const [tick, setTick] = useState(22);       // ms mezi kroky
  const [elapsed, setElapsed] = useState(0);

  // vypočtené maximum pro tenhle run (pro Range a výběr cíle)
  const [maxReach, setMaxReach] = useState(1.00);

  // meta
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestError, setBestError] = useState(Infinity);
  const [history, setHistory] = useState([]);

  // session leaderboardy
  const [topRuns, setTopRuns] = useState([]);
  const [topPrecision, setTopPrecision] = useState([]);

  // daily challenge (fixní target v rámci dne, ale stále v rozsahu 1..maxReach)
  const [dailyMode, setDailyMode] = useState(false);

  // kvóta
  const [playsLeft, setPlaysLeft] = useState(QUOTA_TOTAL);
  const [resetAt, setResetAt] = useState(null);

  // timery
  const growRef = useRef(null);
  const elapsedRef = useRef(null);

  // zvuk
  const [muted, setMuted] = useState(() => localStorage.getItem("muted") === "1");
  const audioCtxRef = useRef(null);

  // ====== HELPERS ======
  const rand = (min, max, decimals = 3) =>
    Number((Math.random() * (max - min) + min).toFixed(decimals));

  // výpočet dosažitelného maxima pro tenhle run (stejná logika, diskrétně)
  const computeMaxReach = (base = 1.0, s, tickMs, maxMs) => {
    let v = base;
    for (let t = 0; t < maxMs; t += tickMs) {
      const rampBoost = 1 + Math.min(t / 4000, RAMP_MAX_BOOST);
      v = +(v + s * rampBoost).toFixed(2);
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

  // jemný tick pro odpočet resetu kvóty v UI
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // haptika
  const vibrate = (pattern = 30) => {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  };

  // zvuky (WebAudio) + napojení na mute z App.jsx
  useEffect(() => {
    const onMute = (e) => setMuted(!!e.detail?.muted);
    window.addEventListener("cg-mute-change", onMute);
    return () => window.removeEventListener("cg-mute-change", onMute);
  }, []);

  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return audioCtxRef.current;
  };
  const beep = (freq = 600, dur = 120, type = "sine", vol = 0.03) => {
    if (muted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      try { osc.stop(); } catch {}
      try { osc.disconnect(); gain.disconnect(); } catch {}
    }, dur);
  };

  // ====== INIT PERSISTENCE + QUOTA ======
  useEffect(() => {
    const p = Number(localStorage.getItem(LS.points) || 0);
    if (!Number.isNaN(p)) setPoints(p);

    const be = Number(localStorage.getItem(LS.bestError) || Infinity);
    if (!Number.isNaN(be)) setBestError(be);

    const hist = JSON.parse(localStorage.getItem(LS.history) || "[]");
    if (Array.isArray(hist)) setHistory(hist);

    const saved = JSON.parse(localStorage.getItem(LS_QUOTA) || "null");
    const now = Date.now();
    if (saved && saved.resetAt && now < saved.resetAt) {
      setPlaysLeft(saved.playsLeft);
      setResetAt(saved.resetAt);
    } else {
      const nextReset = now + QUOTA_WINDOW_HOURS * 60 * 60 * 1000;
      const init = { playsLeft: QUOTA_TOTAL, resetAt: nextReset };
      localStorage.setItem(LS_QUOTA, JSON.stringify(init));
      setPlaysLeft(QUOTA_TOTAL);
      setResetAt(nextReset);
    }
  }, []);

  // ====== START RUNU ======
  const startRound = () => {
    // quota check & případný reset okna
    const now = Date.now();
    if (resetAt && now >= resetAt) {
      const nextReset = now + QUOTA_WINDOW_HOURS * 60 * 60 * 1000;
      setPlaysLeft(QUOTA_TOTAL);
      setResetAt(nextReset);
      localStorage.setItem(LS_QUOTA, JSON.stringify({ playsLeft: QUOTA_TOTAL, resetAt: nextReset }));
    }
    if (playsLeft <= 0) {
      alert(t("alertQuota"));
      return;
    }

    // adrenalin: náhodné tempo pro tenhle run
    const s = rand(0.045, 0.10);            // přírůstek / tick
    const tk = Math.floor(rand(14, 28, 0)); // interval v ms
    setSpeed(s);
    setTick(tk);

    // spočítej maxReach → target bude 1.00 .. maxReach
    const maxV = computeMaxReach(1.0, s, tk, MAX_TIME);
    setMaxReach(maxV);

    // dailyMode: deterministicky v rozsahu 1..maxV, jinak náhodně
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

    // reset hodnot
    setValue(1.00);
    setElapsed(0);
    setResult(null);

    // hráč uvidí parametry a ručně spustí
    setPhase("ready");
  };

  const beginRunning = () => {
    // odečti 1 hru z kvóty
    setPlaysLeft((n) => {
      const next = Math.max(0, n - 1);
      localStorage.setItem(LS_QUOTA, JSON.stringify({ playsLeft: next, resetAt }));
      return next;
    });

    vibrate(15);
    beep(500, 80, "square");

    setPhase("running");
    const startedAt = performance.now();

    // růst hodnoty s ramp-upem
    growRef.current = setInterval(() => {
      const e = performance.now() - startedAt;
      const rampBoost = 1 + Math.min(e / 4000, RAMP_MAX_BOOST);
      setValue((v) => +(v + speed * rampBoost).toFixed(2));
    }, tick);

    // čas + timeout
    elapsedRef.current = setInterval(() => {
      const e = performance.now() - startedAt;
      setElapsed(e);
      if (e >= MAX_TIME) {
        clearInterval(growRef.current);
        clearInterval(elapsedRef.current);
        const diff = Math.abs(value - target) + 0.15; // penalizace za timeout
        finishRound(diff);
      }
    }, 50);
  };

  // ====== STOP/DONE ======
  const stop = () => {
    if (phase !== "running") return;
    vibrate([20, 40, 20]);
    beep(400, 90, "sine");
    clearInterval(growRef.current);
    clearInterval(elapsedRef.current);
    const diff = Math.abs(value - target);
    finishRound(diff);
  };

  // sdílení výsledku
  const shareResult = async (res) => {
    const text = `I hit ${value.toFixed(2)}x vs target ${target.toFixed(2)}x (err ${res.diff.toFixed(2)}) — score +${res.runPoints}. Try it: ${location.href}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Crash Aim", text, url: location.href });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Result copied to clipboard!");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        alert("Result copied to clipboard!");
      } catch {}
    }
  };

  const finishRound = (diff) => {
    let runPoints = Math.max(0, Math.round(150 - diff * 300));
    let note = "OK";

    if (diff <= PERFECT_THR) {
      runPoints += 100; note = t("resultNotePerfect"); setStreak((s) => s + 1);
      vibrate([30, 60, 30]); beep(900, 150, "triangle"); setTimeout(()=>beep(1200, 120, "triangle"), 120);
    } else if (diff <= GOOD_THR) {
      runPoints += 40;  note = t("resultNoteGood");     setStreak((s) => s + 1);
      vibrate(40); beep(750, 120, "sine");
    } else {
      note = t("resultNoteMiss"); setStreak(0);
      beep(220, 120, "sine");
    }

    // bonus za tempo
    const paceBonus = tick < 20 ? 1.2 : tick < 24 ? 1.1 : 1.0;
    runPoints = Math.round(runPoints * paceBonus);

    // streak multiplier (budoucí hodnota streaku), limit x2
    const futureStreak = diff <= GOOD_THR ? streak + 1 : 0;
    const streakMult = Math.min(1 + futureStreak * STREAK_STEP, STREAK_CAP);
    runPoints = Math.round(runPoints * streakMult);

    // body (persist)
    setPoints((p) => {
      const np = p + runPoints;
      localStorage.setItem(LS.points, String(np));
      return np;
    });

    // best přesnost (persist)
    setBestError((prev) => {
      const next = Math.min(prev, diff);
      localStorage.setItem(LS.bestError, String(next));
      return next;
    });

    // historie (persist posledních 10)
    const entry = {
      ts: Date.now(),
      target,
      value,
      diff: Number(diff.toFixed(2)),
      runPoints,
      tick,
      speed: Number(speed.toFixed(3)),
      maxReach,
    };
    setHistory((h) => {
      const next = [entry, ...h].slice(0, 10);
      localStorage.setItem(LS.history, JSON.stringify(next));
      return next;
    });

    // session leaderboardy
    setTopRuns((arr) =>
      [...arr, entry].sort((a, b) => b.runPoints - a.runPoints).slice(0, 5)
    );
    setTopPrecision((arr) =>
      [...arr, entry].sort((a, b) => a.diff - b.diff).slice(0, 5)
    );

    setResult({
      value,
      diff,
      runPoints,
      note,
      speed,
      tick,
      maxReach,
      elapsed: Math.round(elapsed),
      streakMult,
    });
    setPhase("done");
  };

  // klávesové zkratky: Enter = start/confirm, Space = stop
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (e.key === "Enter") {
        if (phase === "idle" || phase === "done") startRound();
        else if (phase === "ready") beginRunning();
      }
      if (e.key === " ") {
        if (phase === "running") {
          e.preventDefault();
          stop();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // uklid při unmountu
  useEffect(() => {
    return () => {
      clearInterval(growRef.current);
      clearInterval(elapsedRef.current);
    };
  }, []);

  // ====== UI ======
  return (
    <div className="w-full max-w-3xl mx-auto p-6 grid gap-6">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {t('title', { x: `${target.toFixed(2)}x` })}
          </h2>
          <div className="text-sm text-gray-500">
            {t('targetRange', { max: maxReach.toFixed(2) })}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right text-sm">
            <div>{t('points')}: <span className="font-semibold">{points}</span></div>
            <div>
              {t('streak')}: <span className="font-semibold">{streak}</span>{" "}
              <span className="text-xs text-gray-500">(x{Math.min(1 + streak * STREAK_STEP, STREAK_CAP).toFixed(2)})</span>
            </div>
            <div className="text-xs text-gray-500">
              {t('bestErr')}: {bestError === Infinity ? "-" : bestError.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">
              {t('playsLeft')}: <span className="font-semibold">{playsLeft}</span>
              {resetAt && <> • {t('resetIn', { time: fmtTime(resetAt - Date.now()) })}</>}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dailyMode} onChange={(e)=>setDailyMode(e.target.checked)} />
            {t('daily')}
          </label>
        </div>
      </div>

      {/* READY panel s parametry (vč. maxReach) */}
      {phase === "ready" ? (
        <div className="grid gap-4 p-4 rounded-xl bg-white text-black shadow">
          <div className="text-2xl font-bold text-center">{t('getReady')}</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm text-center text-gray-700">
            <div>{t('target')}<br/><span className="font-mono text-base">{target.toFixed(2)}x</span></div>
            <div>{t('range')}<br/><span className="font-mono">1.00–{maxReach.toFixed(2)}x</span></div>
            <div>{t('baseSpeed')}<br/><span className="font-mono">{speed.toFixed(3)}</span>/tick</div>
            <div>Tick<br/><span className="font-mono">{tick}ms</span></div>
            <div>Ramp-up<br/><span className="font-mono">+{Math.round(RAMP_MAX_BOOST*100)}%</span></div>
            <div>Time limit<br/><span className="font-mono">{(MAX_TIME/1000).toFixed(0)}s</span></div>
          </div>
          <div className="flex justify-center gap-2">
            <button onClick={beginRunning} className="px-5 py-3 rounded-xl bg-black text-white hover:opacity-90 active:opacity-80 transition">
              {t('startNow')}
            </button>
            <button onClick={() => setPhase("idle")} className="px-5 py-3 rounded-xl bg-gray-200">
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* PROGRESS */}
          <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
            <div
              className="h-2 bg-lime-500 transition-[width] duration-75"
              style={{ width: `${Math.min((elapsed / MAX_TIME) * 100, 100)}%` }}
            />
          </div>

          {/* HODNOTA */}
          <div className="text-center">
            {phase === "running" ? (
              <div className="text-7xl font-mono animate-pulse">{value.toFixed(2)}x</div>
            ) : (
              <div className="text-7xl font-mono">{value.toFixed(2)}x</div>
            )}
          </div>

          {/* OVLÁDÁNÍ */}
          <div className="flex justify-center gap-3">
            {(phase === "idle" || phase === "done") && (
              <button onClick={startRound} className="px-5 py-3 rounded-xl bg-black text-white hover:opacity-90 active:opacity-80 transition">
                {t('startRound')}
              </button>
            )}
            {phase === "running" && (
              <button onClick={stop} className="px-5 py-3 rounded-xl bg-lime-500 text-black font-semibold hover:scale-105 active:scale-95 transition">
                {t('stop')}
              </button>
            )}
          </div>
        </>
      )}

      {/* VÝSLEDEK */}
      {result && (
        <div className="text-center grid gap-2">
          <div>
            Your value: <span className="font-mono">{result.value.toFixed(2)}x</span>{" "}
            • Error: <span className="font-mono">{result.diff.toFixed(2)}</span>
          </div>
          <div className="text-sm font-semibold">
            {result.note} • +{result.runPoints} {t('points')} (streak x{result.streakMult.toFixed(2)})
          </div>
          <div className="flex justify-center gap-2">
            <button onClick={() => shareResult(result)} className="px-3 py-2 rounded bg-gray-200 text-black">
              Share
            </button>
            <button onClick={startRound} className="px-3 py-2 rounded bg-black text-white">
              {t('startRound')}
            </button>
          </div>
          <div className="text-xs text-gray-500">
            time {Math.round(result.elapsed)}ms • base {speed.toFixed(3)} / {tick}ms • max {maxReach.toFixed(2)}x
          </div>
        </div>
      )}

      {/* SESSION LEADERBOARD */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-xl shadow">
          <div className="font-semibold mb-2">{t('topRuns')}</div>
          {topRuns.length === 0 ? (
            <div className="text-sm text-gray-500">{t('noRunsYet')}</div>
          ) : (
            <ol className="text-sm grid gap-1">
              {topRuns.map((r, i) => (
                <li key={`rp_${i}`} className="flex justify-between">
                  <span>#{i+1} • tgt {r.target.toFixed(2)} • val {r.value.toFixed(2)}</span>
                  <span>+{r.runPoints} pts</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="p-4 bg-white rounded-xl shadow">
          <div className="font-semibold mb-2">{t('topPrecision')}</div>
          {topPrecision.length === 0 ? (
            <div className="text-sm text-gray-500">{t('noRunsYet')}</div>
          ) : (
            <ol className="text-sm grid gap-1">
              {topPrecision.map((r, i) => (
                <li key={`pr_${i}`} className="flex justify-between">
                  <span>#{i+1} • tgt {r.target.toFixed(2)} • val {r.value.toFixed(2)}</span>
                  <span>err {r.diff.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* RECENT RUNS */}
      {history.length > 0 && (
        <div className="p-4 bg-white rounded-xl shadow">
          <div className="font-semibold mb-2">{t('recentRuns')}</div>
          <ul className="text-xs text-gray-600 grid gap-1 max-h-32 overflow-auto pr-1">
            {history.map((r, i) => (
              <li key={r.ts + "_" + i} className="flex justify-between">
                <span>{new Date(r.ts).toLocaleTimeString()} • tgt {r.target.toFixed?.(2) ?? r.target} • val {r.value.toFixed?.(2) ?? r.value}</span>
                <span>err {r.diff.toFixed?.(2) ?? r.diff} • +{r.runPoints}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}