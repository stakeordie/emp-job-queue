#!/usr/bin/env node

// Minimal test - just start a server on port 1111
import { createServer } from 'http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
<!DOCTYPE html>
<html>
<head><title>Port Test</title></head>
<body>
  <h1>SUCCESS! Port 1111 works</h1>
  <p>Container: ${process.env.CONTAINER_NAME || 'unknown'}</p>
  <p>Time: ${new Date().toISOString()}</p>
</body>
</html>
  `);
});

server.listen(1111, '0.0.0.0', () => {
  console.log('✅ Server running on 0.0.0.0:1111');
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));