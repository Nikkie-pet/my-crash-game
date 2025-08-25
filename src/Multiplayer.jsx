import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPusher } from "./realtime/pusherClient";
import { toast } from "./components/Toasts";
import Avatar from "./components/Avatar.jsx";
import { getOrCreateUser, setUserName, shortId } from "./lib/user";

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
  const me = getOrCreateUser();
  const [username, setUsername] = useState(me.name);
  const [room, setRoom] = useState(
    (localStorage.getItem("mp_room") || "").toLowerCase().replace(/[^a-z0-9\-]/g, "")
  );

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [channel, setChannel] = useState(null);
  const [pusher, setPusher] = useState(null);
  const [subscribed, setSubscribed] = useState(false);

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

  const getRealtimeMembers = () => {
    const arr = [];
    try { channel?.members?.each((m) => arr.push((m.info?.name || "player").trim())); } catch {}
    return arr.length ? arr : members;
  };

  const publishSummary = (resultsArr) => {
    const expected = getRealtimeMembers().length;
    const sorted = [...resultsArr].sort((a, b) => b.score - a.score);
    const target = sorted.length ? Number(sorted[0].target) : undefined;
    const round = sorted.length ? (sorted[0].roundId || lastRoundId) : lastRoundId;

    window.dispatchEvent(
      new CustomEvent("cg-round-summary", {
        detail: {
          roundId: round,
          target,
          expectedPlayers: expected,
          results: sorted.map((r) => ({
            userId: r.userId,
            name: r.name,
            value: Number(r.value),
            target: Number(r.target),
            diff: Math.abs(Number(r.value) - Number(r.target)),
            score: Number(r.score),
            crashed: !!r.crashed,
            ts: r.ts,
          })),
        },
      })
    );
  };

  useEffect(() => {
    const onGameResult = (e) => {
      const r = e.detail || {};
      setLastRoundId(r.roundId || r.ts || Date.now());
      setLastResults((prev) => {
        const next = [...(prev || []).filter((x) => !(x.userId === r.userId && x.roundId === r.roundId)), r];
        publishSummary(next);
        return next.sort((a, b) => b.score - a.score);
      });
      if (channel) {
        try { channel.trigger("client-round-result", r); } catch {}
      }
    };
    window.addEventListener("cg-game-result", onGameResult);
    return () => window.removeEventListener("cg-game-result", onGameResult);
  }, [channel]);

  const joinRoom = async () => {
    setError("");
    const cleanName = setUserName(username);
    const cleanRoom = room.toLowerCase().replace(/[^a-z0-9\-]/g, "");
    if (!cleanRoom) return setError("Zadej název místnosti.");
    if (!cleanName) return setError("Zadej jméno.");

    localStorage.setItem("mp_room", cleanRoom);
    setUsername(cleanName);
    setRoom(cleanRoom);

    const key = import.meta.env.VITE_PUSHER_KEY;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER;
    if (!key || !cluster) return setError("Chybí VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER (ENV).");

    setJoining(true);

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
        setError("Pusher error – fallback máme přes server, ale zkontroluj nastavení.");
        toast("Pusher error", "error");
      });

      ch.bind("client-ready", ({ userId, name, ready }) => {
        const n = (name || "player").trim();
        setReadyNames((prev) => {
          const has = prev.includes(n);
          if (ready && !has) return [...prev, n];
          if (!ready && has) return prev.filter((x) => x !== n);
          return prev;
        });
      });

      ch.bind("client-round-start", (payload) => {
        const current = [];
        ch.members.each((m) => current.push((m.info?.name || "player").trim()));
        const currentHost = current.sort()[0];
        if (payload?.from !== currentHost) return;

        setReadyNames([]);
        setIAmReady(false);
        setLastRoundId(payload.seed || payload.startAt || Date.now());
        setLastResults([]);
        window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));

        const safetyDelay = (Number(payload.maxTime) || 8000) + 2500;
        setTimeout(() => publishSummary(lastResults), safetyDelay);
      });

      ch.bind("server-round-result", (r) => {
        setLastRoundId((prev) => prev ?? r.roundId ?? r.ts ?? Date.now());
        setLastResults((prev) => {
          const next = [...(prev || []).filter((x) => !(x.userId === r.userId && x.ts === r.ts)), r]
            .sort((a, b) => b.score - a.score);
          publishSummary(next);
          return next;
        });
      });

      ch.bind("client-round-result", (r) => {
        setLastRoundId((prev) => prev ?? r.roundId ?? r.ts ?? Date.now());
        setLastResults((prev) => {
          const next = [...(prev || []).filter((x) => !(x.userId === r.userId && x.ts === r.ts)), r]
            .sort((a, b) => b.score - a.score);
          publishSummary(next);
          return next;
        });
      });

    } catch (e) {
      console.error("[MP] createPusher failed", e);
      setError(`Nepodařilo se inicializovat Pusher: ${e?.message || e}`);
      setJoining(false);
      toast("Nepodařilo se připojit", "error");
    }
  };

  const leaveRoom = () => {
    try { pusher?.unsubscribe(`presence-${room}`); pusher?.disconnect(); } catch {}
    setJoined(false); setJoining(false); setSubscribed(false);
    setMembers([]); setReadyNames([]); setIAmReady(false);
    setChannel(null); setPusher(null); setError(""); setLastResults([]);
    try { delete window.__mp; } catch {}
  };

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
    channel.trigger("client-ready", { userId: me.id, name: username, ready: next });
    if (next) toast("Připraven/a ✅", "success");
  };

  const areAllRealtimeReady = () => {
    const rt = getRealtimeMembers();
    if (rt.length < 2) return false;
    return rt.every((n) => readyNames.includes(n));
  };

  const startSynchronizedRound = async () => {
    if (!channel) return setError("Channel není připraven.");
    if (!subscribed) return setError("Ještě nejsi plně připojen/á (subscription).");

    const current = getRealtimeMembers();
    const currentHost = current.slice().sort()[0];

    if (currentHost !== username) return setError(`Start může spustit pouze hostitel (${currentHost || "—"}).`);
    if (current.length < 2) return setError("Start je možný až od 2 hráčů v místnosti.");
    if (!areAllRealtimeReady()) return setError("Start až když jsou všichni READY.");
    if (Date.now() < lockUntilRef.current) return;

    const startAt = Date.now() + 3500;
    const maxTime = 8000;
    const maxMult = Number((3.8 + Math.random() * (5.2 - 3.8)).toFixed(2));
    const targetMax = Math.max(1.10, maxMult - 0.05);
    const sharedTarget = Number((1.10 + Math.random() * (targetMax - 1.10)).toFixed(2));
    const seed = Date.now();

    // požádej server o podpis parametrů kola
    let sig = null;
    try {
      const r = await fetch("/api/round-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, startAt, maxTime, maxMult, target: sharedTarget, seed }),
      }).then((x) => x.json());
      if (!r?.ok || !r.sig) throw new Error(r?.error || "sign failed");
      sig = r.sig;
    } catch (e) {
      console.error("round-sign failed", e);
      setError("Nepodařilo se podepsat kolo (server).");
      toast("Server sign selhal", "error");
      return;
    }

    const payload = { seed, startAt, from: username, room, maxMult, maxTime, target: sharedTarget, sig };

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
    window.dispatchEvent(new CustomEvent("cg-mp-round", { detail: payload }));
  };

  const canStart = joined && subscribed && getRealtimeMembers().length >= 2 && isHost && areAllRealtimeReady();

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
              onBlur={(e) => setUsername(setUserName(e.target.value))}
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
          {error && <div className="md:col-span-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Místnost:</div>
              <div className="font-semibold">{room}</div>
              <div className="text-xs text-slate-500 mt-1">Hostitel: <strong>{(members.length ? [...members].sort()[0] : "—")}</strong></div>
              <div className="text-xs text-slate-500 mt-1">
                Players: {getRealtimeMembers().length} · Ready: {readyNames.length}/{getRealtimeMembers().length}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Btn onClick={toggleReady} className={iAmReady ? "bg-emerald-500 text-white border-emerald-500" : ""}>
                {iAmReady ? "✓ READY" : "I'm ready"}
              </Btn>
              <Btn onClick={startSynchronizedRound} disabled={!canStart} className={!canStart ? "opacity-60 cursor-not-allowed" : ""}>
                Start round (host)
              </Btn>
              <Btn onClick={leaveRoom}>Leave</Btn>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm text-slate-500 mb-1">Hráči v místnosti:</div>
            <div className="flex flex-wrap gap-3">
              {getRealtimeMembers().map((n, i) => {
                const rdy = readyNames.includes(n);
                const isMe = n === username;
                return (
                  <span key={i} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${rdy
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300"
                    : "bg-neutral-100 dark:bg-slate-800 border-neutral-200 dark:border-slate-700"}`}>
                    <Avatar name={n} userId={isMe ? me.id : n} size={22} />
                    <span>{n}{isMe ? ` (#${shortId(me.id)})` : ""}{rdy ? " ✓" : ""}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Last round</h3>
              <div className="text-xs text-slate-500">{lastRoundId ? `#${lastRoundId}` : "—"}</div>
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
                      <th className="py-1 pr-4">Δ</th>
                      <th className="py-1 pr-4">Důvod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResults.map((r, idx) => (
                      <tr key={idx} className="border-t border-neutral-200 dark:border-slate-800">
                        <td className="py-1 pr-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.name} userId={r.userId || r.name} size={20} />
                            <span className={r.userId === me.id ? "font-semibold" : ""}>
                              {r.name}{r.userId ? ` (#${shortId(r.userId)})` : ""}{r.userId === me.id ? " (ty)" : ""}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-4 font-semibold">{r.score}</td>
                        <td className="py-1 pr-4">{Number(r.value).toFixed(2)}×</td>
                        <td className="py-1 pr-4">{Number(r.target).toFixed(2)}×</td>
                        <td className="py-1 pr-4">{Math.abs(Number(r.value)-Number(r.target)).toFixed(2)}×</td>
                        <td className="py-1 pr-4">{r.crashed ? "Crash" : "Stop"}</td>
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