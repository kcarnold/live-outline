import 'dotenv/config'
import express, { static as serveStatic, json } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from 'url';
import path from 'path';
import { AssemblyAI } from "assemblyai";
import { DocumentManager } from '@y-sweet/sdk'

import { getTranslation, getTranslationEfficient, AnthropicProvider } from './nlp.ts';
import { translateBlock, GeminiProvider } from './nlp_gemini_2.ts';
import type { TranslationTodo } from './nlp_gemini_2.ts';

// Get API keys from environment variables, crash if not set
function getEnvOrCrash(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

const anthropicProvider = new AnthropicProvider({
  apiKey: getEnvOrCrash('ANTHROPIC_API_KEY'),
  defaultModel: "claude-3-5-haiku-20241022",
  maxTokens: 8192,
});

const geminiProvider = new GeminiProvider({
  apiKey: getEnvOrCrash('GEMINI_API_KEY'),
  defaultModel: "gemini-2.0-flash-lite",
  maxTokens: 8192,
});

const documentManager = new DocumentManager(getEnvOrCrash("YSWEET_CONNECTION_STRING"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("public"));
app.use(json());

const aai = new AssemblyAI({ apiKey: getEnvOrCrash("ASSEMBLYAI_API_KEY") });
app.use(
  "/assemblyai.js",
  express.static(
    join(__dirname, "node_modules/assemblyai/dist/assemblyai.umd.js"),
  ),
);
 
// AAI
app.get("/api/aai_token", async (_req, res) => {
  const hours = 4;
  const token = await aai.realtime.createTemporaryToken({ expires_in: hours * 60 * 60 });
  res.json({ token });
});
 


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

function withTrailingNewline(text) {
  return text.endsWith('\n') ? text : text + '\n';
}



app.post('/api/requestTranslatedBlocks', async (req, res) => {
  console.log('Request translated blocks:', req.body);
  const translationTodos = (req.body?.translationTodos as [TranslationTodo]) ?? [];
  const languages = req.body?.languages ?? [];

  

  const promises = translationTodos.map(async (todo) => {
    return await translateBlock(geminiProvider, todo, languages[0]);
  });

  const results = await Promise.all(promises);
  return res.json({
    ok: true,
    results
  });
});



app.post('/api/requestTranslation', async (req, res) => {
  const text = withTrailingNewline(req.body?.text ?? "");
  const prevSourceText = withTrailingNewline(req.body?.prevText ?? "");
  const prevTranslatedText = req.body?.prevTranslatedText ?? "";
  const language = req.body?.language ?? "";
  const efficientMode = req.body?.efficientMode ?? false;
  console.log('Request translation:', text, prevSourceText, prevTranslatedText, language, efficientMode);

  let result = {};
  let translatedText = "";
  try {
    if (efficientMode) {
      translatedText = await getTranslationEfficient(anthropicProvider, text, prevSourceText, prevTranslatedText, language);
    } else
      translatedText = await getTranslation(anthropicProvider, text, prevTranslatedText, language);
    result = { ok: true, translatedText, text: text };
  } catch (e) {
    console.error('Error translating:', e);
    result = { ok: false, error: e.message };
    res.status(500);
  }
  res.json(result);
});


const PORT = process.env.PORT || 8000;
app.set("port", PORT);

const server = app.listen(app.get("port"), () => {
  console.log(`HTTP/WS Server running on http://localhost:${PORT}`);
}).on('error', (error) => {
  console.error('Server error:', error);
});
