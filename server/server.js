cat > ~/Documents/my-crash-game/server/server.js <<'JS'
const http = require('http');

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK\n');
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
JS