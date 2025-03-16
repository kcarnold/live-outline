import 'dotenv/config'
import express, { static as serveStatic, json } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from 'url';
import path from 'path';
import { DocumentManager } from '@y-sweet/sdk'
import Anthropic from '@anthropic-ai/sdk';

const anthropicClient = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
});

const claudeModel = "claude-3-5-haiku-20241022";
const MAX_TOKENS = 8192;

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
  const efficientMode = req.body?.efficientMode ?? false;

  let result = {}
  let translatedText = "";
  try {
    if (efficientMode) 
      translatedText = await getTranslationEfficient(text, prevTranslatedText, language);
    else
      translatedText = await getTranslation(text, prevTranslatedText, language);
    result = { ok: true, translatedText };
  } catch (e) {
    console.error('Error translating:', e);
    result = { ok: false, error: e.message };
    res.status(500);
  }
  res.json(result);
});


const getTranslation = async (text, prevTranslatedText, language) => {
  const message = await anthropicClient.messages.create({
    max_tokens: MAX_TOKENS,
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
` }],

    model: claudeModel,
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
    throw new Error("Could not extract translation from response");
  }
  return translatedText;
}

const getTranslationEfficient = async (text, prevTranslatedText, language) => {
  const msg = await anthropicClient.messages.create({
    model: claudeModel,
    max_tokens: MAX_TOKENS,
    temperature: 0.1,
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": `We are translating text into ${language} as it comes in. We already have a translation, but we need to update it to account for new text. Call the \"insert\", \"update\", or \"replaceEntireText\" tools to update the translation.

Note: Long tool calls cost us more money. So:
- If the change is only adding a line, use the \"insert\" tool.
- When using \"update\", use the shortest possible string that uniquely identifies the text to be replaced.
- Only call \"replaceEntireText\" as a last resort, if the amount of incorrect text is large.
- If no edits are needed, simply respond with inserting an empty string.
- Think about the cost of your edits, and try to be efficient.

Existing translation (to update):\n\`\`\`\n${prevTranslatedText}\n\`\`\`

New source text; update the translation to correspond to this:\n\`\`\`\n${text}\n\`\`\`\n`
          }
        ]
      }
    ],
    tools: [
      {
        "name": "replaceEntireText",
        "description": "Replace the entire text with a new translation",
        "input_schema": {
          "type": "object",
          "properties": {
            "new_str": {
              "type": "string",
              "description": "The new translation"
            }
          },
          "required": [
            "new_str"
          ]
        }
      },
      {
        "name": "insert",
        "description": "Insert text at a given line number",
        "input_schema": {
          "type": "object",
          "properties": {
            "line_num": {
              "type": "integer",
              "description": "Line number of insertion point (0 = insert at beginning, 1 = insert after first line, -1 = insert at end"
            },
            "new_str": {
              "type": "string",
              "description": "Text to insert"
            }
          },
          "required": [
            "linu_num",
            "new_str"
          ]
        }
      },
      {
        "name": "update",
        "description": "Substitute one string for another",
        "input_schema": {
          "type": "object",
          "properties": {
            "old_str": {
              "type": "string",
            },
            "new_str": {
              "type": "string",
              "description": "Text to replace old_str with"
            }
          },
          "required": [
            "old_str",
            "new_str"
          ]
        }
      }
    ]
  });

  // Extract the tool call
  if (msg.stop_reason !== 'tool_use') {
    throw new Error('Expected tool_use stop reason');
  }
  console.dir(msg, { depth: null });
  const tool = msg.content.find(
    (content) => content.type === 'tool_use',
  );

  // The tools assumed that prevTranslatedText ended with a newline, so we add one here if it doesn't
  if (prevTranslatedText.length > 0 && prevTranslatedText[prevTranslatedText.length - 1] !== '\n') {
    prevTranslatedText += '\n';
  }

  if (tool.name === 'replaceEntireText') {
    const newStr = tool.input.new_str;
    console.log(`Replacing entire text.'`);
    return newStr;
  } else if (tool.name === 'insert') {
    const lineNum = tool.input.line_num;
    const newStr = tool.input.new_str;
    console.log(`Inserting '${newStr}' at line ${lineNum}`);
    // Find where to insert the new text
    let insertionPoint = 0;
    if (lineNum === 0) {
      // insert at beginning
      insertionPoint = 0;
    } else if (lineNum === -1) {
      // insert at end
      insertionPoint = prevTranslatedText.length;
    } else {
      // insert after the specified line
      const lines = prevTranslatedText.split('\n');
      let lineIndex = 0;
      while (lineIndex < lines.length && lineNum > 0) {
        insertionPoint += lines[lineIndex].length + 1; // +1 for newline
        lineIndex++;
        lineNum--;
      }
    }
    const newTranslatedText = prevTranslatedText.slice(0, insertionPoint) + newStr + prevTranslatedText.slice(insertionPoint);
    return newTranslatedText;
  } else if (tool.name === 'update') {
    const oldStr = tool.input.old_str;
    const newStr = tool.input.new_str;
    if (oldStr === newStr) {
      console.warn('Old and new strings are the same');
      return prevTranslatedText;
    }
    console.log(`Updating '${oldStr}' to '${newStr}'`);
    // Make sure the old string is in the text
    if (!prevTranslatedText.includes(oldStr)) {
      console.error(`Old string '${oldStr}' not found in text`);
      throw new Error('Old string not found in text');
    }
    const newTranslatedText = prevTranslatedText.replace(oldStr, newStr);
    return newTranslatedText;
  }
  throw new Error(`Unexpected tool name: ${tool.name}`);
}

const PORT = process.env.PORT || 8000;
app.set("port", PORT);

const server = app.listen(app.get("port"), () => {
  console.log(`HTTP/WS Server running on http://localhost:${PORT}`);
}).on('error', (error) => {
  console.error('Server error:', error);
});
