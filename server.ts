import 'dotenv/config'
import express from "express";
import path from "path";
import { fileURLToPath } from 'url';

import { DocumentManager } from '@y-sweet/sdk'

import { translateBlock, GeminiProvider } from './nlp.ts';
import type { TranslationTodo } from './nlp.ts';

// Get API keys from environment variables, crash if not set
function getEnvOrCrash(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

const geminiProvider = new GeminiProvider({
  apiKey: getEnvOrCrash('GEMINI_API_KEY'),
  defaultModel: "gemini-2.0-flash-lite",
  maxTokens: 8192,
});

const documentManager = new DocumentManager(getEnvOrCrash("YSWEET_CONNECTION_STRING"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("dist"));
app.use(express.json());


// AssemblyAI v3 token endpoint
app.get("/api/aai_token", async (_req, res) => {
  const expiresInSeconds = 2 * 60;
  const apiKey = getEnvOrCrash("ASSEMBLYAI_API_KEY");
  const url = `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${expiresInSeconds}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AssemblyAI token fetch failed: ${response.status} ${errText}`);
    }
    const data = await response.json();
    res.json({ token: data.token });
  } catch (error: any) {
    console.error("Error generating temp token:", error?.message || error);
    res.status(500).json({ error: "Failed to generate token" });
  }
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


app.post('/api/requestTranslatedBlocks', async (req, res) => {
  console.log('Request translated blocks:', req.body);
  const translationTodos = (req.body?.translationTodos as [TranslationTodo]) ?? [];
  const language = req.body?.language;

  const promises = translationTodos.map(async (todo) => {
    return await translateBlock(geminiProvider, todo, language);
  });

  const results = await Promise.all(promises);
  return res.json({
    ok: true,
    results
  });
});



const PORT = process.env.PORT || 8000;
app.set("port", PORT);



// Catch-all route to support React Router (client-side routing), but do not serve index.html for static asset requests
app.get('*', (req, res, next) => {
  // If the request is for a file with an extension (e.g., .js, .css, .png), skip to next middleware
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(app.get("port"), () => {
  console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (error) => {
  console.error('Server error:', error);
});
