const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// pro sync času
app.get('/now', (_req, res) => res.json({ now: Date.now() }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Jednoduchá lobby logika: JOIN -> READY -> COUNTDOWN -> START
const lobbies = new Map();
function getOrCreateLobby(id){
  if(!lobbies.has(id)){
    lobbies.set(id, { id, state:'waiting', players:new Set(), ready:new Set(), version:0 });
  }
  return lobbies.get(id);
}
function serializeLobby(l){
  return {
    id:l.id, state:l.state,
    players:[...l.players], ready:[...l.ready],
    version:l.version, seed:l.seed ?? null, startAt:l.startAt ?? null
  };
}
function canAutoStart(l, need=2){
  const enough = l.players.size >= need;
  const allReady = l.players.size>0 && l.ready.size===l.players.size;
  return l.state==='waiting' && enough && allReady;
}
function startLobby(l, reason){
  if(l.state!=='waiting') return;
  l.state='countdown'; l.version++;
  l.seed = `${Date.now()}-${Math.random()}`;
  l.startAt = Date.now()+3000;
  io.to(l.id).emit('game:countdown', { version:l.version, seed:l.seed, startAt:l.startAt, reason });
  setTimeout(()=>{
    if(l.state!=='countdown') return;
    l.state='in_game';
    io.to(l.id).emit('game:start', { version:l.version, seed:l.seed, startedAt:l.startAt });
  }, Math.max(0, l.startAt - Date.now()));
}

io.on('connection', (sock)=>{
  console.log('🟢 connected:', sock.id);

  sock.on('joinLobby', ({lobbyId})=>{
    const l = getOrCreateLobby(lobbyId);
    l.players.add(sock.id);
    sock.join(l.id);
    io.to(l.id).emit('lobby:update', serializeLobby(l));
    if(canAutoStart(l)) startLobby(l,'auto');
  });

  sock.on('player:ready', ({lobbyId})=>{
    const l = getOrCreateLobby(lobbyId);
    l.ready.add(sock.id);
    io.to(l.id).emit('lobby:update', serializeLobby(l));
    if(canAutoStart(l)) startLobby(l,'auto');
  });

  sock.on('req:start', ({lobbyId})=>{
    const l = getOrCreateLobby(lobbyId);
    if(l.state==='waiting') startLobby(l,'manual');
  });

  sock.on('disconnect', ()=>{
    for(const l of lobbies.values()){
      if(l.players.delete(sock.id)){
        l.ready.delete(sock.id);
        io.to(l.id).emit('lobby:update', serializeLobby(l));
      }
    }
    console.log('🔴 disconnected:', sock.id);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
httpServer.listen(PORT, ()=>console.log(`🚀 Server running on http://localhost:${PORT}`));