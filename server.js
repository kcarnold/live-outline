import 'dotenv/config'
import express, { static as serveStatic, json } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer } from 'ws';
import { handleMessage, broadcastState } from './state.js';
import { DocumentManager } from '@y-sweet/sdk'
import Anthropic from '@anthropic-ai/sdk';

const anthropicClient = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
});

const documentManager = new DocumentManager(process.env.YSWEET_CONNECTION_STRING);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("public"));
app.use(json());


// Y-Sweet
app.post('/api/ys-auth', async (req, res) => {
  console.log('Auth request:', req.body);
  const docId = req.body?.docId ?? null;
  const isEditor = req.body?.isEditor ?? false;
  const authorization = isEditor ? 'full' : 'read-only';
  // In a production app, this is where you'd authenticate the user
  // and check that they are authorized to access the doc.
  const clientToken = await documentManager.getOrCreateDocAndToken(docId, {
    authorization
  })
  res.send(clientToken)
})

app.post('/api/requestTranslation', async (req, res) => {
  const { text } = req.body;
  const prevTranslatedText = req.body?.prevTranslatedText ?? "";
  const language = req.body?.language ?? "";

  const message = await anthropicClient.messages.create({
    max_tokens: 1024,
    messages: [{ role: 'user', content: `We are translating text into ${language} as it comes in.

So we need to update the translation we have so far to account for the new text.

# old translated text
${prevTranslatedText}

# new text
${text}

Please respond in this format:

<thoughts>
Your interpretation of what we're doing, any needed thinking, and any clarifications you need.
</thoughts>

<translation>
The completed updated translation
</translation>

<commentary>
Any additional comments or thoughts you have on the translation process or the translation itself.
</commentary>
` }],

    model: 'claude-3-7-sonnet-latest',
  });


  // Extract the translated text from Claude's response
  const fullResponse = message.content[0].text;
  console.log('Full response:', fullResponse);
  let translatedText = "";

  // Parse the response to extract the translation between <translation> tags
  const translationMatch = fullResponse.match(/<translation>([\s\S]*?)<\/translation>/);
  if (translationMatch && translationMatch[1]) {
    translatedText = translationMatch[1].trim();
  } else {
    console.error("Could not extract translation from response");
    translatedText = "Translation error";
  }
  console.log('Translated text:', translatedText);
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