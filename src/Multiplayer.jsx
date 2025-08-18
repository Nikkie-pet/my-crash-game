// src/Multiplayer.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPusher } from "./realtime/pusherClient";

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
  const [username, setUsername] = useState(() => localStorage.getItem("mp_name") || "Player");
  const [room, setRoom] = useState(() => localStorage.getItem("mp_room") || "");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [channel, setChannel] = useState(null);
  const [pusher, setPusher] = useState(null);
  const isHost = useMemo(() => {
    if (!joined || !members.length) return false;
    const first = [...members].sort()[0];
    return first === username;
  }, [joined, members, username]);

  useEffect(() => {
    return () => { try { pusher?.disconnect(); } catch {} };
  }, [pusher]);

  const joinRoom = async () => {
    setError("");
    if (!room.trim()) { setError("Zadej název místnosti."); return; }

    const key = import.meta.env.VITE_PUSHER_KEY;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER;
    if (!key || !cluster) { setError("Chybí VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER."); return; }

    setJoining(true);
    localStorage.setItem("mp_name", username);
    localStorage.setItem("mp_room", room);

    try {
      const p = createPusher(username);
      setPusher(p);

      const ch = p.subscribe(`presence-${room}`);

      ch.bind("pusher:subscription_succeeded", (mems) => {
        const list = [];
        mems.each((m) => list.push(m.info?.name || "player"));
        setMembers(list);
        setJoined(true);
        setJoining(false);
        console.log("[MP] subscription_succeeded → members:", list);
      });

      ch.bind("pusher:member_added", (member) => {
        const name = member.info?.name || "player";
        setMembers((prev) => [...prev, name]);
      });

      ch.bind("pusher:member_removed", (member) => {
        const name = member.info?.name || "player";
        setMembers((prev) => prev.filter((n) => n !== name));
      });

      ch.bind("pusher:subscription_error", (status) => {
        console.error("[MP] subscription_error", status);
        setJoining(false);
        setError(`Subscription error (${status}). Zkontroluj /api/pusher-auth a ENV na Vercelu.`);
      });

      ch.bind("pusher:error", (err) => {
        console.error("[MP] pusher:error", err);
        setError("Pusher error – zkontroluj Client Events v Pusher App Settings.");
      });

      // příjem startu kola → přepošleme do hry
      ch.bind("client-round-start", (payload) => {
        window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
      });

      setChannel(ch);
    } catch (e) {
      console.error("[MP] createPusher failed", e);
      setError(e?.message || "Nepodařilo se inicializovat Pusher.");
      setJoining(false);
    }
  };

  const leaveRoom = () => {
    try { pusher?.unsubscribe(`presence-${room}`); pusher?.disconnect(); } catch {}
    setJoined(false); setJoining(false); setMembers([]); setChannel(null); setPusher(null);
  };

  // Host pošle parametr kola + synchronní startAt
  const startSynchronizedRound = () => {
    if (!channel) return;
    // countdown 3.5s (buffer na síť + 3-2-1)
    const startAt = Date.now() + 3500;

    const payload = {
      seed: Date.now(),                         // deterministický target
      tick: Math.floor(26 + Math.random() * 6), // 26–31 ms
      speed: Number((0.03 + Math.random() * 0.02).toFixed(3)), // 0.030–0.050
      maxTime: 12000,
      startAt,                                  // <<< synchronizace
    };

    // klientská událost (vyžaduje zapnuté „Client events“ v Pusher App Settings)
    channel.trigger("client-round-start", payload);
    // host rovnou spustí taky
    window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
  };

  const canStart = joined && isHost && members.length >= 2;

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
              onChange={(e) => setUsername(e.target.value.slice(0, 24))}
              placeholder="Tvoje přezdívka"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm text-slate-500">Místnost (room)</label>
            <input
              className="px-3 py-2 rounded-lg border border-neutral-300 dark:bg-slate-900 dark:border-slate-700"
              value={room}
              onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 24))}
              placeholder="např. friends-123"
            />
          </div>

          <div className="flex items-end">
            <Btn onClick={joinRoom} disabled={joining}>{joining ? "Připojuji…" : "Připojit se"}</Btn>
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
                {isHost ? "Jsi host" : "Hostem je hráč s abecedně prvním jménem"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Btn onClick={startSynchronizedRound} disabled={!canStart} className={!canStart ? "opacity-60 cursor-not-allowed" : ""}>
                Start round (host)
              </Btn>
              <Btn onClick={leaveRoom}>Leave</Btn>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm text-slate-500 mb-1">Hráči v místnosti:</div>
            <div className="flex flex-wrap gap-2">
              {members.map((m, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700">
                  {m}
                </span>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Start je možný až ve dvou a více hráčích; všem poběží synchronní 3-2-1.
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </section>
  );
}