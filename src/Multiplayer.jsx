// src/Multiplayer.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getOrCreateUser } from "./lib/user";
import Avatar from "./components/Avatar";
import { pusher, ensurePresence } from "./realtime/pusherClient";
import { t } from "./components/LanguageSwitch";

function normRoom(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9\-]/g, "");
}

export default function Multiplayer({ lang = "cs" }) {
  const me = getOrCreateUser();
  const [name, setName] = useState(me.name || "Player");
  const [roomInput, setRoomInput] = useState(localStorage.getItem("mp_room") || "");
  const room = useMemo(() => normRoom(roomInput), [roomInput]);

  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]); // {id, name}
  const [ready, setReady] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [debugMsg, setDebugMsg] = useState("");

  const iAmHost = hostId === me.id;
  const readyCount = members.filter(m => m.ready).length;
  const playerCount = members.length;

  // Ulož jméno & room do LS pro Game.jsx i další relog
  useEffect(() => {
    localStorage.setItem("mp_name", name);
    localStorage.setItem("mp_room", room);
  }, [name, room]);

  // Připojení k presence kanálu
  const join = async () => {
    if (!room) return alert("Zadej název místnosti (povolené znaky: a-z 0-9 -)");
    setConnecting(true);
    try {
      const ch = await ensurePresence(`presence-room-${room}`);
      setChannel(ch);
      setDebugMsg("Subscribed to presence channel.");

      // po úspěšné sub: registrace členů
      const list = [];
      ch.members.each((m) => {
        list.push({ id: m.id, name: m.info?.name || "Player", ready: !!m.info?.ready });
      });
      list.sort((a,b)=>a.id.localeCompare(b.id));
      setMembers(list);

      // host = lexikograficky první id v místnosti
      setHostId(list[0]?.id);

      // Bindování: někdo se přidá
      ch.bind("pusher:member_added", (m) => {
        setMembers((prev) => {
          const next = prev.some(x => x.id === m.id) ? prev : [...prev, { id: m.id, name: m.info?.name || "Player", ready: !!m.info?.ready }];
          next.sort((a,b)=>a.id.localeCompare(b.id));
          setHostId(next[0]?.id);
          return [...next];
        });
      });

      // Bindování: někdo odejde
      ch.bind("pusher:member_removed", (m) => {
        setMembers((prev) => {
          const next = prev.filter(x => x.id !== m.id);
          setHostId(next[0]?.id || null);
          return next;
        });
      });

      // Custom event: někdo změnil jméno / ready stav
      ch.bind("mp:presence-update", (payload) => {
        setMembers((prev) => {
          const next = prev.map(p => p.id === payload.id ? { ...p, name: payload.name ?? p.name, ready: typeof payload.ready === "boolean" ? payload.ready : p.ready } : p);
          next.sort((a,b)=>a.id.localeCompare(b.id));
          setHostId(next[0]?.id || null);
          return next;
        });
      });

      // Event start kola (přesměruj do Game)
      ch.bind("mp:round", (data) => {
        setDebugMsg("Received mp:round");
        window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: data }));
      });

      // při připojení hned pošli moje jméno (a případně ready)
      ch.trigger("client-mp-presence-ping", { id: me.id, name, ready });
      ch.bind("client-mp-presence-ping", (p) => {
        // všichni aktualizují seznam
        setMembers((prev) => {
          const exists = prev.some(x => x.id === p.id);
          const next = exists ? prev.map(x => x.id === p.id ? { ...x, name: p.name, ready: !!p.ready } : x)
                              : [...prev, { id: p.id, name: p.name, ready: !!p.ready }];
          next.sort((a,b)=>a.id.localeCompare(b.id));
          setHostId(next[0]?.id || null);
          return next;
        });
      });

      setDebugMsg((m) => m + " Members: " + list.length);
    } catch (e) {
      console.error("join failed", e);
      alert("Nepodařilo se připojit k místnosti.\n" + (e?.message || e));
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    if (channel) {
      try { pusher.unsubscribe(channel.name); } catch {}
      setChannel(null);
      setMembers([]);
      setHostId(null);
      setReady(false);
    }
  };

  // změna jména: ping do místnosti
  useEffect(() => {
    if (!channel) return;
    try { channel.trigger("client-mp-presence-ping", { id: me.id, name, ready }); } catch {}
  }, [name]); // eslint-disable-line

  // změna ready: ping do místnosti
  useEffect(() => {
    if (!channel) return;
    try { channel.trigger("client-mp-presence-ping", { id: me.id, name, ready }); } catch {}
  }, [ready]); // eslint-disable-line

  // Můžu startovat?
  const minPlayers = 2;
  const canStart = iAmHost && playerCount >= minPlayers && readyCount === playerCount;

  const startRound = async () => {
    if (!canStart) return;
    setStartBusy(true);
    try {
      // parametry kola (hostitel je zvolí → tady fixně)
      const maxTime = 8000;
      const maxMult = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
      const tMax = Math.max(1.10, maxMult - 0.05);
      const target = Number((1.10 + Math.random() * (tMax - 1.10)).toFixed(2));
      const startAt = Date.now() + 3000; // 3s countdown
      const seed = startAt;

      const roomName = room;
      const body = { room: roomName, startAt, maxTime, maxMult, target, seed };

      const res = await fetch("/api/round-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const tx = await res.text();
        throw new Error(`round-start failed (${res.status}): ${tx}`);
      }

      setDebugMsg(`Start sent. Target ${target.toFixed(2)}×`);
    } catch (e) {
      console.error("startRound error", e);
      alert("Start kola selhal: " + (e?.message || e));
    } finally {
      setStartBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <h2 className="text-lg font-semibold mb-3">{t(lang,"multiplayer") || "Multiplayer"}</h2>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="flex items-center gap-2">
          <Avatar name={name} />
          <input
            className="flex-1 rounded-lg border px-3 py-2 bg-white dark:bg-slate-800"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tvoje jméno"
          />
        </div>

        <input
          className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-800"
          value={roomInput}
          onChange={(e) => setRoomInput(e.target.value)}
          placeholder="Název místnosti (např. alpha-team)"
        />

        {!channel ? (
          <button
            onClick={join}
            disabled={connecting || !room}
            className="rounded-lg px-4 py-2 bg-emerald-600 text-white disabled:opacity-50"
          >
            {connecting ? "Připojuji…" : "Připojit se"}
          </button>
        ) : (
          <button
            onClick={leave}
            className="rounded-lg px-4 py-2 bg-neutral-200 dark:bg-slate-700"
          >
            Odejít
          </button>
        )}
      </div>

      {channel && (
        <>
          <div className="mt-4 text-sm text-slate-500">
            Místnost: <span className="font-mono">{room}</span> · Hostitel:{" "}
            <span className="font-mono">{hostId || "—"}</span> {iAmHost && <span className="text-emerald-600">(ty)</span>} ·
            Hráči {playerCount}, Ready {readyCount}/{playerCount}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={ready} onChange={(e)=>setReady(e.target.checked)} />
              Jsem připraven/á
            </label>

            <button
              onClick={startRound}
              disabled={!canStart || startBusy}
              className="rounded-lg px-4 py-2 bg-indigo-600 text-white disabled:opacity-50"
              title={!canStart ? "Start jen hostitel & všichni musí být připraveni (min 2 hráči)" : ""}
            >
              {startBusy ? "Startuji…" : "Start round (host)"}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-4">ID</th>
                  <th className="py-1 pr-4">Jméno</th>
                  <th className="py-1 pr-4">Ready</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-t border-neutral-200 dark:border-slate-800">
                    <td className="py-1 pr-4 font-mono">{m.id}</td>
                    <td className="py-1 pr-4">{m.name}</td>
                    <td className="py-1 pr-4">{m.ready ? "✔︎" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!debugMsg && <div className="mt-2 text-xs text-slate-500">Debug: {debugMsg}</div>}
        </>
      )}
    </section>
  );
}