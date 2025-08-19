// src/Multiplayer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPusher } from "./realtime/pusherClient";
import { toast } from "./components/Toasts";

function Btn({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={
        "px-4 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 " +
        className
      }
    >
      {children}
    </button>
  );
}

export default function Multiplayer() {
  const [username, setUsername] = useState(() =>
    (localStorage.getItem("mp_name") || "Player").trim()
  );
  const [room, setRoom] = useState(() =>
    (localStorage.getItem("mp_room") || "")
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, "")
  );

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [channel, setChannel] = useState(null);
  const [pusher, setPusher] = useState(null);
  const [subscribed, setSubscribed] = useState(false);

  // READY stav
  const [readyNames, setReadyNames] = useState([]);
  const [iAmReady, setIAmReady] = useState(false);

  const [lastRoundId, setLastRoundId] = useState(null);
  const [lastResults, setLastResults] = useState([]);

  const lockUntilRef = useRef(0);

  const hostName = useMemo(
    () => (members.length ? [...members].sort()[0] : null),
    [members]
  );
  const isHost = useMemo(() => !!hostName && hostName === username, [hostName, username]);

  useEffect(() => () => { try { pusher?.disconnect(); } catch {} }, [pusher]);

  // výsledky ze hry → lokálně a broadcast do room
  useEffect(() => {
    const onGameResult = (e) => {
      const result = e.detail || {};
      setLastRoundId(result.roundId || result.ts || Date.now());
      setLastResults((prev) => {
        const filtered = (prev || []).filter((r) => r.name !== result.name);
        return [...filtered, result].sort((a, b) => b.score - a.score);
      });
      if (channel) {
        try { channel.trigger("client-round-result", result); } catch {}
      }
    };
    window.addEventListener("cg-game-result", onGameResult);
    return () => window.removeEventListener("cg-game-result", onGameResult);
  }, [channel]);

  const joinRoom = async () => {
    setError("");

    const cleanName = username.replace(/\s+/g, " ").trim();
    const cleanRoom = room.toLowerCase().replace(/[^a-z0-9\-]/g, "");

    if (!cleanRoom) { setError("Zadej název místnosti."); return; }
    if (!cleanName) { setError("Zadej jméno."); return; }

    const key = import.meta.env.VITE_PUSHER_KEY;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER;
    if (!key || !cluster) {
      setError("Chybí VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER (zkontroluj ENV).");
      return;
    }

    setJoining(true);
    localStorage.setItem("mp_name", cleanName);
    localStorage.setItem("mp_room", cleanRoom);
    setUsername(cleanName);
    setRoom(cleanRoom);

    try {
      const p = createPusher(cleanName);
      setPusher(p);

      const ch = p.subscribe(`presence-${cleanRoom}`);

      ch.bind("pusher:subscription_succeeded", (mems) => {
        const list = [];
        mems.each((m) => list.push((m.info?.name || "player").trim()));
        if (!list.includes(cleanName)) list.push(cleanName);
        setMembers(list);
        setReadyNames([]);
        setIAmReady(false);
        setJoined(true);
        setSubscribed(true);
        setJoining(false);
        setChannel(ch);
        try { window.__mp = { pusher: p, channel: ch, room: cleanRoom }; } catch {}
        toast(`Připojeno do místnosti ${cleanRoom}`, "success");
      });

      ch.bind("pusher:member_added", (member) => {
        const name = (member.info?.name || "player").trim();
        setMembers((prev) => (prev.includes(name) ? prev : [...prev, name]));
      });

      ch.bind("pusher:member_removed", (member) => {
        const name = (member.info?.name || "player").trim();
        setMembers((prev) => prev.filter((n) => n !== name));
        setReadyNames((prev) => prev.filter((n) => n !== name));
      });

      ch.bind("pusher:subscription_error", (status) => {
        const code = status?.status || status?.code || "unknown";
        const msg = status?.error || status?.message || "";
        setJoining(false);
        setSubscribed(false);
        setError(`Subscription error (code ${code}) ${msg ? "– " + msg : ""}.`);
        toast(`Subscription error (${code})`, "error");
      });

      ch.bind("pusher:error", (err) => {
        console.error("[MP] pusher:error", err);
        setError("Pusher error – zkontroluj Client events v Pusher App Settings.");
        toast("Pusher error", "error");
      });

      // READY sync od ostatních
      ch.bind("client-ready", (payload) => {
        const { name, ready } = payload || {};
        setReadyNames((prev) => {
          const has = prev.includes(name);
          if (ready && !has) return [...prev, name];
          if (!ready && has) return prev.filter((n) => n !== name);
          return prev;
        });
      });

      // start kola (pouze od aktuálního hosta), payload obsahuje target
      ch.bind("client-round-start", (payload) => {
        try {
          const currentMembers = [];
          ch.members.each((m) => currentMembers.push((m.info?.name || "player").trim()));
          const currentHost = currentMembers.sort()[0];
          if (payload?.from !== currentHost) return;

          setReadyNames([]);
          setIAmReady(false);

          setLastRoundId(payload.seed || payload.startAt || Date.now());
          setLastResults([]);
          // → Game.jsx si přečte target z payloadu
          window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
        } catch (e) {
          console.error("[MP] client-round-start handler error:", e);
        }
      });

      // výsledky od ostatních
      ch.bind("client-round-result", (result) => {
        setLastRoundId((prev) => prev ?? result.roundId ?? result.ts ?? Date.now());
        setLastResults((prev) => {
          const filtered = (prev || []).filter((r) => r.name !== result.name);
          return [...filtered, result].sort((a, b) => b.score - a.score);
        });
      });
    } catch (e) {
      console.error("[MP] createPusher failed", e);
      const msg = e?.message || String(e);
      setError(`Nepodařilo se inicializovat Pusher: ${msg}`);
      setJoining(false);
      toast("Nepodařilo se připojit", "error");
    }
  };

  const leaveRoom = () => {
    try { pusher?.unsubscribe(`presence-${room}`); pusher?.disconnect(); } catch {}
    setJoined(false);
    setJoining(false);
    setSubscribed(false);
    setMembers([]);
    setReadyNames([]);
    setIAmReady(false);
    setChannel(null);
    setPusher(null);
    setError("");
    setLastResults([]);
    try { delete window.__mp; } catch {}
  };

  // odesílatel si ihned upraví READY stav lokálně (client events se nevrací zpět)
  const toggleReady = () => {
    if (!channel) return;
    const next = !iAmReady;
    setIAmReady(next);
    setReadyNames((prev) => {
      const has = prev.includes(username);
      if (next && !has) return [...prev, username];
      if (!next && has) return prev.filter((n) => n !== username);
      return prev;
    });
    channel.trigger("client-ready", { name: username, ready: next });
    if (next) toast("Připraven/a ✅", "success");
  };

  const getRealtimeMembers = () => {
    const arr = [];
    try { channel?.members?.each((m) => arr.push((m.info?.name || "player").trim())); } catch {}
    return arr;
  };

  const areAllRealtimeReady = () => {
    const rt = getRealtimeMembers();
    if (rt.length < 2) return false;
    return rt.every((n) => readyNames.includes(n));
  };

  const startSynchronizedRound = () => {
    if (!channel) { setError("Channel není připraven."); toast("Channel není připraven", "error"); return; }
    if (!subscribed) { setError("Ještě nejsi plně připojen/á (subscription)."); toast("Čekám na subscription…", "error"); return; }

    const currentMembers = getRealtimeMembers();
    const currentHost = currentMembers.slice().sort()[0];

    if (currentHost !== username) { setError(`Start může spustit pouze hostitel (${currentHost || "—"}).`); toast("Nejsi hostitel", "error"); return; }
    if (currentMembers.length < 2) { setError("Start je možný až od 2 hráčů v místnosti."); toast("Potřeba min. 2 hráči", "error"); return; }
    if (!areAllRealtimeReady()) { setError("Start až když jsou všichni READY."); toast("Všichni musí být READY", "error"); return; }
    if (Date.now() < lockUntilRef.current) return;

    const startAt = Date.now() + 3500;

    // 🔹 SPOLEČNÝ TARGET: host ho spočítá a pošle všem
    // Zde jednoduchý výběr (1.10x – 5.00x). Můžeš nahradit vlastní logikou.
    const sharedTarget = Number((1.10 + Math.random() * (5.0 - 1.10)).toFixed(2));

    const payload = {
      seed: Date.now(),
      tick: Math.floor(26 + Math.random() * 6),
      speed: Number((0.03 + Math.random() * 0.02).toFixed(3)),
      maxTime: 12000,
      startAt,
      from: username,
      room,
      target: sharedTarget, // <<<<<<<<<<<<<< KLÍČOVÉ
    };

    lockUntilRef.current = startAt + 500;
    setLastRoundId(payload.seed);
    setLastResults([]);

    const ok = channel.trigger("client-round-start", payload);
    if (!ok) {
      setError("Client events nejsou povolené nebo nejsi přihlášen/á.");
      toast("Client events OFF / not subscribed", "error");
      return;
    }

    toast(`Kolo startuje… 3·2·1 (cíl ${sharedTarget.toFixed(2)}×)`, "info");
    // host startne hned
    window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
  };

  const canStart =
    joined && subscribed && members.length >= 2 && isHost && areAllRealtimeReady();

  let startHint = "";
  if (!joined) startHint = "Nejsi připojen/á v místnosti.";
  else if (!subscribed) startHint = "Čekám na dokončení připojení…";
  else if (members.length < 2) startHint = "Čekám alespoň na 2 hráče v místnosti.";
  else if (!areAllRealtimeReady()) startHint = "Start až když jsou všichni READY.";
  else if (!isHost) startHint = `Start spouští hostitel (${hostName || "—"}).`;

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <h2 className="text-lg font-semibold mb-4">Multiplayer (beta)</h2>

      {!joined ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1">
            <label className="text-sm text-slate-500">Jméno</label>
            <input
              className="px-3 py-2 rounded-lg border border-neutral-300 dark:bg-slate-900 dark:border-slate-700"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.replace(/\s+/g, " ").trim().slice(0, 24))
              }
              placeholder="Tvoje přezdívka"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm text-slate-500">Místnost (room)</label>
            <input
              className="px-3 py-2 rounded-lg border border-neutral-300 dark:bg-slate-900 dark:border-slate-700"
              value={room}
              onChange={(e) =>
                setRoom(
                  e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 24)
                )
              }
              placeholder="např. friends-123"
            />
          </div>

          <div className="flex items-end">
            <Btn onClick={joinRoom} disabled={joining}>
              {joining ? "Připojuji…" : "Připojit se"}
            </Btn>
          </div>

          {error && (
            <div className="md:col-span-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Místnost:</div>
              <div className="font-semibold">{room}</div>
              <div className="text-xs text-slate-500 mt-1">
                Hostitel: <strong>{hostName || "—"}</strong>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Players: {members.length} · Ready: {readyNames.length}/{members.length} · isHost:
                {String(isHost)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Btn
                onClick={toggleReady}
                className={iAmReady ? "bg-emerald-500 text-white border-emerald-500" : ""}
              >
                {iAmReady ? "✓ READY" : "I'm ready"}
              </Btn>
              <Btn
                onClick={startSynchronizedRound}
                disabled={!canStart}
                className={!canStart ? "opacity-60 cursor-not-allowed" : ""}
              >
                Start round (host)
              </Btn>
              <Btn onClick={leaveRoom}>Leave</Btn>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">{!canStart && startHint}</div>

          {/* seznam hráčů + READY stav */}
          <div className="mt-4">
            <div className="text-sm text-slate-500 mb-1">Hráči v místnosti:</div>
            <div className="flex flex-wrap gap-2">
              {members.map((m, i) => {
                const rdy = readyNames.includes(m);
                return (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full border ${
                      rdy
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                        : "bg-neutral-100 dark:bg-slate-800 border-neutral-200 dark:border-slate-700"
                    }`}
                  >
                    {m}{rdy ? " ✓" : ""}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Poslední kolo */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Last round</h3>
              <div className="text-xs text-slate-500">
                {lastRoundId ? `#${lastRoundId}` : "—"}
              </div>
            </div>
            {lastResults.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-4">Hráč</th>
                      <th className="py-1 pr-4">Skóre</th>
                      <th className="py-1 pr-4">Hodnota</th>
                      <th className="py-1 pr-4">Cíl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResults.map((r, idx) => (
                      <tr key={idx} className="border-t border-neutral-200 dark:border-slate-800">
                        <td className="py-1 pr-4">{r.name}</td>
                        <td className="py-1 pr-4 font-semibold">{r.score}</td>
                        <td className="py-1 pr-4">{Number(r.value).toFixed(2)}×</td>
                        <td className="py-1 pr-4">{Number(r.target).toFixed(2)}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-2">Zatím žádné výsledky pro aktuální kolo.</div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </section>
  );
}