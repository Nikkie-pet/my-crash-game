// src/Multiplayer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "./components/LanguageSwitch";
import Avatar from "./components/Avatar";
import { getOrCreateUser } from "./lib/user";
import { pusher, ensurePresence } from "./realtime/pusherClient";

/**
 * Poznámky:
 * - Vyžaduje funkční /api/pusher-auth (server) + Vercel ENV.
 * - Události pro Game.jsx:
 *    - "cg-mp-round"           → spustí kolo se sdílenými parametry
 *    - "cg-round-summary"      → zobrazí tabulku výsledků kola
 *    - "cg-game-result"        → zachytáváme u hostitele a skládáme souhrn
 */

export default function Multiplayer({ lang = "cs" }) {
  const user = useMemo(() => getOrCreateUser(), []);
  const [room, setRoom] = useState(() => (localStorage.getItem("mp_room") || "").toLowerCase());
  const [name, setName] = useState(() => localStorage.getItem("mp_name") || user.name || "Player");
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]); // {id,name}…

  const [allReady, setAllReady] = useState(false);
  const [iAmReady, setIAmReady] = useState(false);
  const readinessRef = useRef({}); // userId -> bool

  const [roundOngoing, setRoundOngoing] = useState(false);
  const currentRoundRef = useRef(null); // {seed,startAt,maxTime,maxMult,target,sig}

  // Pusher kanály
  const presenceRef = useRef(null);               // presence-room-<room>
  const controlChannelRef = useRef(null);         // private-room-<room>-control
  const resultsChannelRef = useRef(null);         // private-room-<room>-results

  // pomocný nonce pro podpis
  const randomSeed = () => Math.floor(1e12 + Math.random() * 9e12);

  // Připojení do room (presence)
  const joinRoom = async () => {
    const r = (room || "").toLowerCase().replace(/[^a-z0-9\-]/g, "");
    const nm = (name || "Player").trim().slice(0, 24);
    if (!r) return alert(lang === "cs" ? "Zadej název místnosti" : "Enter room name");

    // persist lokálně
    localStorage.setItem("mp_room", r);
    localStorage.setItem("mp_name", nm);

    try {
      const presence = await ensurePresence(`presence-room-${r}`, { id: user.id, name: nm });
      presenceRef.current = presence;

      // seznam členů
      const rebuild = () => {
        const mem = presenceRef.current?.members?.members || {};
        const arr = Object.keys(mem).map((k) => ({ id: k, name: mem[k].info?.name || "Player" }));
        arr.sort((a, b) => a.name.localeCompare(b.name));
        setPlayers(arr);
        // všichni ready?
        const rdy = arr.length > 0 && arr.every((p) => readinessRef.current[p.id]);
        setAllReady(rdy);
      };

      presence.bind("pusher:subscription_succeeded", rebuild);
      presence.bind("pusher:member_added", rebuild);
      presence.bind("pusher:member_removed", (m) => {
        delete readinessRef.current[m.id];
        rebuild();
      });

      setJoined(true);
      setIsHost(false);
      setIAmReady(false);
      readinessRef.current[user.id] = false;

      // control kanál (spouštění kola pouze hostem)
      controlChannelRef.current = pusher.subscribe(`private-room-${r}-control`);
      resultsChannelRef.current = pusher.subscribe(`private-room-${r}-results`);

      // Host určíme jednoduše: abecedně první user_id v místnosti
      presence.bind("pusher:subscription_succeeded", () => {
        rebuild();
        if (presence.members.count > 0) {
          const allIds = Object.keys(presence.members.members).sort();
          setIsHost(allIds[0] === user.id);
        }
      });

      // Příjem příkazu „start round“ → předej do Game.jsx
      controlChannelRef.current.bind("mp-start", (data) => {
        currentRoundRef.current = data;
        setRoundOngoing(true);
        window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: data }));
      });

      // Informace o ready stavech
      controlChannelRef.current.bind("ready-state", ({ id, ready }) => {
        readinessRef.current[id] = !!ready;
        const mem = presenceRef.current?.members?.members || {};
        const ids = Object.keys(mem);
        const rdy = ids.length > 0 && ids.every((uid) => readinessRef.current[uid]);
        setAllReady(rdy);
      });

      // Souhrn kola (host → všichni)
      resultsChannelRef.current.bind("round-summary", (summary) => {
        window.dispatchEvent(new CustomEvent("cg-round-summary", { detail: summary }));
        setRoundOngoing(false);
        // reset readiness po skončení kola
        Object.keys(readinessRef.current).forEach((k) => (readinessRef.current[k] = false));
        setIAmReady(false);
        controlChannelRef.current.trigger?.("client-ready", { id: user.id, ready: false });
      });

      // Ready zpráva mezi klienty (client events)
      controlChannelRef.current.bind("client-ready", ({ id, ready }) => {
        readinessRef.current[id] = !!ready;
        const mem = presenceRef.current?.members?.members || {};
        const ids = Object.keys(mem);
        const rdy = ids.length > 0 && ids.every((uid) => readinessRef.current[uid]);
        setAllReady(rdy);
      });

      alert(lang === "cs" ? "Připojeno do místnosti." : "Joined room.");
    } catch (e) {
      console.error("joinRoom failed:", e);
      alert((lang === "cs" ? "Chyba připojení: " : "Join error: ") + (e?.message || e));
    }
  };

  // odpojit
  const leaveRoom = () => {
    try {
      if (presenceRef.current) pusher.unsubscribe(presenceRef.current.name);
      if (controlChannelRef.current) pusher.unsubscribe(controlChannelRef.current.name);
      if (resultsChannelRef.current) pusher.unsubscribe(resultsChannelRef.current.name);
    } catch {}
    presenceRef.current = null;
    controlChannelRef.current = null;
    resultsChannelRef.current = null;
    setPlayers([]);
    setJoined(false);
    setIsHost(false);
    setIAmReady(false);
  };

  // přepnutí „ready“
  const toggleReady = () => {
    if (!joined || !controlChannelRef.current) return;
    const next = !iAmReady;
    setIAmReady(next);
    readinessRef.current[user.id] = next;
    controlChannelRef.current.trigger("client-ready", { id: user.id, ready: next });
  };

  // Host: start kola → broadcast parametrů všem
  const startRound = () => {
    if (!joined || !isHost || !controlChannelRef.current) return;
    // Všichni musí být ready
    if (!allReady) {
      return alert(lang === "cs" ? "Ne všichni jsou READY." : "Not everyone is READY.");
    }
    // parametry kola
    const maxTime = 8000;
    const maxMult = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
    const tMax = Math.max(1.10, maxMult - 0.05);
    const target = Number((1.10 + Math.random() * (tMax - 1.10)).toFixed(2));
    const startAt = Date.now() + 3000;
    const seed = randomSeed();
    const data = { room, startAt, maxTime, maxMult, target, seed, sig: String(seed) /* demo podpis */ };

    currentRoundRef.current = data;
    setRoundOngoing(true);

    // Rozeslat klientům
    controlChannelRef.current.trigger("client-mp-start", data);
  };

  // Klientům nasloucháme i client event (pokrytí všech)
  useEffect(() => {
    if (!controlChannelRef.current) return;
    const ch = controlChannelRef.current;
    const onStart = (data) => {
      currentRoundRef.current = data;
      setRoundOngoing(true);
      window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: data }));
    };
    ch.bind("client-mp-start", onStart);
    return () => ch.unbind("client-mp-start", onStart);
  }, [controlChannelRef.current]);

  // Host sbírá „cg-game-result“ od všech a po timeoutu zveřejní souhrn
  useEffect(() => {
    if (!joined) return;
    const resultsMap = new Map(); // userId -> payload

    const onRes = (e) => {
      const d = e.detail || {};
      if (!currentRoundRef.current || roundOngoing === false) return;
      // ulož poslední známý výsledek daného hráče
      resultsMap.set(d.userId, d);
    };
    window.addEventListener("cg-game-result", onRes);

    let finalizeTimer = null;

    const maybeFinalize = () => {
      if (!isHost || !currentRoundRef.current) return;
      clearTimeout(finalizeTimer);
      // Po konci maxTime + buffer 1500ms spočítat pořadí
      const msLeft = Math.max(0, currentRoundRef.current.startAt + currentRoundRef.current.maxTime + 1500 - Date.now());
      finalizeTimer = setTimeout(() => {
        const target = currentRoundRef.current.target;
        const roundId = currentRoundRef.current.seed;
        const results = Array.from(resultsMap.values())
          .map((r) => ({
            userId: r.userId,
            name: r.name,
            value: Number(r.value),
            diff: Math.abs(Number(r.value) - Number(target)),
            score: r.score,
            crashed: !!r.crashed,
          }))
          .sort((a, b) => a.diff - b.diff || b.score - a.score);

        const summary = {
          roundId,
          target,
          expectedPlayers: players.length,
          results,
        };

        // broadcast na results kanál (client event zaručí doručení i bez server hooku)
        if (resultsChannelRef.current) {
          resultsChannelRef.current.trigger("client-round-summary", summary);
        }
        // a rovnou i lokálně vyvolej event, aby ho viděl hostitel
        window.dispatchEvent(new CustomEvent("cg-round-summary", { detail: summary }));
        setRoundOngoing(false);

        // reset ready
        Object.keys(readinessRef.current).forEach((k) => (readinessRef.current[k] = false));
        setIAmReady(false);
        controlChannelRef.current?.trigger?.("client-ready", { id: user.id, ready: false });
      }, msLeft);
    };

    // Reaguj na konec kola (přichází z Game.jsx, když doběhne čas)
    const onRoundEnd = () => maybeFinalize();
    window.addEventListener("cg-round-ended", onRoundEnd);

    return () => {
      window.removeEventListener("cg-game-result", onRes);
      window.removeEventListener("cg-round-ended", onRoundEnd);
      clearTimeout(finalizeTimer);
    };
  }, [joined, isHost, roundOngoing, players]);

  // client přijímá summary (aby fungovalo i pro nehostitele bez server hooku)
  useEffect(() => {
    if (!resultsChannelRef.current) return;
    const ch = resultsChannelRef.current;
    const onSummary = (summary) => {
      window.dispatchEvent(new CustomEvent("cg-round-summary", { detail: summary }));
      setRoundOngoing(false);
    };
    ch.bind("client-round-summary", onSummary);
    return () => ch.unbind("client-round-summary", onSummary);
  }, [resultsChannelRef.current]);

  return (
    <section className="rounded-2xl bg-white shadow-soft border border-neutral-200 p-6 dark:bg-slate-900 dark:border-slate-800">
      <h2 className="text-lg font-semibold mb-3">{t(lang, "multiplayer") || "Multiplayer"}</h2>

      {!joined ? (
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">{lang === "cs" ? "Místnost" : "Room"}</div>
            <input
              className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-950 border-neutral-300 dark:border-slate-700"
              value={room}
              onChange={(e) => setRoom(e.target.value.toLowerCase())}
              placeholder="např. alpha-team"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">{lang === "cs" ? "Tvoje jméno" : "Your name"}</div>
            <input
              className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-950 border-neutral-300 dark:border-slate-700"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Player"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={joinRoom}
              className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {lang === "cs" ? "Připojit se" : "Join"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2 py-1 rounded bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700">
              Room: <strong>{room}</strong>
            </span>
            <span className="px-2 py-1 rounded bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700">
              You: <strong>{name}</strong>
            </span>
            <span className="px-2 py-1 rounded bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700">
              {isHost ? (lang === "cs" ? "Hostitel" : "Host") : (lang === "cs" ? "Hráč" : "Player")}
            </span>
            <button
              onClick={leaveRoom}
              className="ml-auto px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-slate-700"
            >
              {lang === "cs" ? "Odejít" : "Leave"}
            </button>
          </div>

          {/* Seznam hráčů */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 dark:border-slate-800 bg-neutral-50/60 dark:bg-slate-800/50">
                <Avatar name={p.name} />
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500 break-all">{p.id}</div>
                </div>
                <div
                  className={
                    "text-xs px-2 py-1 rounded " +
                    (readinessRef.current[p.id]
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-neutral-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300")
                  }
                >
                  {readinessRef.current[p.id] ? (lang === "cs" ? "READY" : "READY") : (lang === "cs" ? "ČEKÁ" : "WAITING")}
                </div>
              </div>
            ))}
          </div>

          {/* Ovládání */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={toggleReady}
              disabled={roundOngoing}
              className={"px-4 py-2 rounded-lg border " + (iAmReady
                ? "bg-emerald-600 text-white border-emerald-700"
                : "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border-neutral-300 dark:border-slate-700")}
            >
              {iAmReady ? (lang === "cs" ? "Jsem READY" : "I am READY") : (lang === "cs" ? "Připravit se" : "Get ready")}
            </button>

            <button
              onClick={startRound}
              disabled={!isHost || !allReady || roundOngoing}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
              title={!isHost ? (lang === "cs" ? "Spouští jen hostitel" : "Only host can start") : ""}
            >
              {lang === "cs" ? "Start round (host)" : "Start round (host)"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}