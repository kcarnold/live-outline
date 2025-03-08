import 'dotenv/config'
import express, { static as serveStatic, json } from "express";
import { join, dirname } from "path";
import { AssemblyAI } from "assemblyai";
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer } from 'ws';
import { handleMessage, broadcastState } from './state.js';
import { DocumentManager } from '@y-sweet/sdk'

const documentManager = new DocumentManager(process.env.YSWEET_CONNECTION_STRING);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("public"));
app.use(json());


// Y-Sweet
app.post('/api/auth', async (req, res) => {
  const docId = req.body?.docId ?? null;
  const isEditor = req.body?.isEditor ?? false;
  const authorization = isEditor ? 'full' : 'read-only';
  // In a production app, this is where you'd authenticate the user
  // and check that they are authorized to access the doc.
  const clientToken = await manager.getOrCreateDocAndToken(docId, {
    authorization
  })
  res.send(clientToken)
})

app.post('/api/requestTranslation', async (req, res) => {
  const { text } = req.body;
  // Placeholder for translation logic
  const translatedText = `Translated: ${text}`;
  res.json({ translatedText });
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