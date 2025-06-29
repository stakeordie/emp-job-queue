import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from the parent directory
app.use(express.static(join(__dirname, '..')));

// Default route serves the monitor dashboard
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '..', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Monitor client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      // Echo back for testing
      ws.send(JSON.stringify({
        type: 'echo',
        data: data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Monitor client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
  console.log(`Simple Redis Monitor server running on port ${PORT}`);
  console.log(`Dashboard available at: http://localhost:${PORT}`);
});