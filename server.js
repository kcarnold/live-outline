import 'dotenv/config'
import express, { static as serveStatic, json } from "express";
import { join, dirname } from "path";
import { AssemblyAI } from "assemblyai";
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer } from 'ws';
import { handleMessage, broadcastState } from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
const app = express();
app.use(express.static("public"));
app.use(
  "/assemblyai.js",
  express.static(
    join(__dirname, "node_modules/assemblyai/dist/assemblyai.umd.js"),
  ),
);
app.use(json());

app.get("/token", async (_req, res) => {
  const token = await aai.realtime.createTemporaryToken({ expires_in: 3600 });
  res.json({ token });
});

const PORT = process.env.PORT || 8000;
app.set("port", PORT);

const server = app.listen(app.get("port"), () => {
  console.log(`HTTP/WS Server running on http://localhost:${PORT}`);
}).on('error', (error) => {
  console.error('Server error:', error);
});

const wss = new WebSocketServer({ server });

wss.on('error', (error) => {
  console.error('WebSocket Server error:', error);
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  console.log('Client connected');
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      await handleMessage(message, ws);
    } catch (error) {
      console.error('Message handling error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: error.message
      }));
    }
  });

  ws.on('close', () => {
    // Handle disconnection in state management
    handleMessage({ type: 'disconnect' }, ws);
  });
});