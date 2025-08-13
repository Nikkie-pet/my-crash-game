// src/Multiplayer.jsx
import React, { useEffect, useState } from "react";
import { createPusher } from "./realtime/pusherClient";

function Btn({ children, ...props }) {
  return (
    <button
      {...props}
      className="px-4 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

export default function Multiplayer() {
  const [username, setUsername] = useState(() => localStorage.getItem("mp_name") || "Player");
  const [room, setRoom] = useState(() => localStorage.getItem("mp_room") || "");
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState([]);
  const [channel, setChannel] = useState(null);
  const [pusher, setPusher] = useState(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => () => { try { pusher?.disconnect(); } catch {} }, [pusher]);

  const joinRoom = async () => {
    if (!room.trim()) return;
    localStorage.setItem("mp_name", username);
    localStorage.setItem("mp_room", room);

    const p = createPusher(username);
    setPusher(p);

    const ch = p.subscribe(`presence-${room}`);

    ch.bind("pusher:subscription_succeeded", (mems) => {
      setJoined(true);
      const list = [];
      mems.each((m) => list.push(m.info?.name || "player"));
      setMembers(list);

      // jednoduché pravidlo: host je abecedně první jméno
      setIsHost([...list].sort()[0] === username);
    });

    ch.bind("pusher:member_added", (member) => {
      setMembers((prev) => [...prev, member.info?.name || "player"]);
    });

    ch.bind("pusher:member_removed", (member) => {
      setMembers((prev) => prev.filter((n) => n !== (member.info?.name || "player")));
    });

    // poslech klientských událostí (client-*)
    const onClientRoundStart = (payload) => {
      window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
    };
    ch.bind("client-round-start", onClientRoundStart);

    setChannel(ch);
  };

  const leaveRoom = () => {
    try { pusher?.unsubscribe(`presence-${room}`); pusher?.disconnect(); } catch {}
    setJoined(false); setMembers([]); setChannel(null); setPusher(null);
  };

  // Host: pošli start kola
  const startSynchronizedRound = () => {
    if (!channel) return;
    const payload = {
      seed: Date.now(),
      tick: Math.floor(26 + Math.random() * 6),                  // 26–31 ms
      speed: Number((0.03 + Math.random() * 0.02).toFixed(3)),   // 0.030–0.050
      maxTime: 12000,
    };
    channel.trigger("client-round-start", payload);
    // ať host taky startne okamžitě:
    window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
  };

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
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tvoje přezdívka"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm text-slate-500">Místnost (room)</label>
            <input
              className="px-3 py-2 rounded-lg border border-neutral-300 dark:bg-slate-900 dark:border-slate-700"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="např. friends-123"
            />
          </div>

          <div className="flex items-end">
            <Btn onClick={joinRoom}>Připojit se</Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Místnost:</div>
              <div className="font-semibold">{room}</div>
            </div>
            <div className="flex items-center gap-2">
              {isHost && <Btn onClick={startSynchronizedRound}>Start round (host)</Btn>}
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
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Host vygeneruje parametry kola a odešle je všem. Všichni hrají stejné kolo.
          </p>
        </>
      )}
    </section>
  );
}