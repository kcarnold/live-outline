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

app.set("port", 8000);
const server = app.listen(app.get("port"), () => {
  console.log(
    `Server is running on port http://localhost:${server.address().port}`,
  );
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      await handleMessage(message, ws);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  });

  ws.on('close', () => {
    // Handle disconnection in state management
    handleMessage({ type: 'disconnect' }, ws);
  });
});
