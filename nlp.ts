import Anthropic from '@anthropic-ai/sdk';
import * as Diff from 'diff';

export class AnthropicProvider {
  anthropicClient: Anthropic;
  defaultModel: string;
  maxTokens: number;
  

  constructor({ apiKey, defaultModel, maxTokens }) {
    this.anthropicClient = new Anthropic({
      apiKey: apiKey
    });
    this.defaultModel = defaultModel;
    this.maxTokens = maxTokens;
  }
}

export const getTranslation = async (provider, text, prevTranslatedText, language) => {
  const message = await provider.anthropicClient.messages.create({
    max_tokens: provider.maxTokens,
    model: provider.defaultModel,
    messages: [{ role: 'user', content: `We are translating text into ${language} as it comes in.

So we need to update the translation we have so far to account for the new text.

# old translated text
${prevTranslatedText}

# new text
${text}

Please respond in this format:

<translation>
The completed updated translation
</translation>

Always give the complete translation, even if it's just a small change or there is some uncertainty.
` }],

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

export const getTranslationEfficient = async (provider, text, prevSourceText, prevTranslatedText, language) => {
    // Get the diff between the previous source text and the new source text
    let patch = Diff.createPatch("source_text.txt", prevSourceText, text, null, null, { context: 3 });
    // remove "\ No newline at end of file"
    patch = patch.replace(/\\ No newline at end of file\n/g, '');
    // Remove the first 4 lines since they're just header
    patch = patch.split('\n').slice(4).join('\n');

    const prompt = `We are translating text into ${language} as it comes in. We already have a translation, but we need to update it to account for new text. A diff representing the difference in source text is provided; translate the new text into ${language} and then update the translation by calling the \"update\" or \"replaceEntireText\" tools.

- When using \"update\", use the shortest possible string that uniquely identifies the text to be replaced.
- Only call \"replaceEntireText\" as a last resort, if the amount of incorrect text is large.
- Always call a tool. Make all tool calls at once in parallel; don't wait for a response before making the next call.
- Maintain whitespace; you may need to insert whitespace at the beginning or end of a line.

Existing translation (to update):\n\`\`\`\n${prevTranslatedText}\n\`\`\`

Source text diff; update the translation to correspond to this:\n\n\`\`\`\n${patch}\n\`\`\`\n

`;
  console.log('Prompt:', prompt);

  const tools = [
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
    // {
    //   "name": "insert",
    //   "description": "Insert text at a given line number",
    //   "input_schema": {
    //     "type": "object",
    //     "properties": {
    //       "line_num": {
    //         "type": "integer",
    //         "description": "Line number of insertion point (0 = insert at beginning, 1 = insert after first line, -1 = insert at end"
    //       },
    //       "new_str": {
    //         "type": "string",
    //         "description": "Text to insert (including newline if needed)"
    //       }
    //     },
    //     "required": [
    //       "line_num",
    //       "new_str"
    //     ]
    //   }
    // },
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
            "description": "Text to replace old_str with, including newline characters if needed"
          }
        },
        "required": [
          "old_str",
          "new_str"
        ]
      },
      "cache_control": {"type": "ephemeral"}
    }
  ];

  const msg = await provider.anthropicClient.beta.messages.create({
    model: provider.defaultModel,
    maxTokens: provider.maxTokens,
    temperature: 0.1,
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": prompt
          }
        ]
      }
    ],
    tools: tools,
    //betas: ["token-efficient-tools-2025-02-19"]
  });

  // Extract the tool call
  if (msg.stop_reason !== 'tool_use') {
    throw new Error('Expected tool_use stop reason');
  }
  // The tools assumed that prevTranslatedText ended with a newline, so we add one here if it doesn't
  if (prevTranslatedText.length > 0 && prevTranslatedText[prevTranslatedText.length - 1] !== '\n') {
    prevTranslatedText += '\n';
  }

  console.dir(msg, { depth: null });
  let newTranslatedText = prevTranslatedText
  for (const content of msg.content) {
    if (content.type === 'tool_use') {
      newTranslatedText = applyTool(content, newTranslatedText);
    }
  }

  return newTranslatedText;

}

function applyTool(tool, prevTranslatedText) {

  if (tool.name === 'replaceEntireText') {
    const newStr = tool.input.new_str;
    console.log(`Replacing entire text.'`);
    return newStr;
  } else if (tool.name === 'insert') {
    let lineNum = tool.input.line_num;
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
    // Replace the *last* occurrence of the old string with the new string
    const lastIndex = prevTranslatedText.lastIndexOf(oldStr);
    const newTranslatedText = prevTranslatedText.slice(0, lastIndex) + newStr + prevTranslatedText.slice(lastIndex + oldStr.length);
    return newTranslatedText;
  }
  throw new Error(`Unexpected tool name: ${tool.name}`);
}
