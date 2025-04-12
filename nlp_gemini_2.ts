import genAI from '@google/genai'; 
import * as Diff from 'diff';

export class GeminiProvider {
  apiClient: genAI.GoogleGenAI;
  defaultModel: string;
  maxTokens: number;
  

  constructor({ apiKey, defaultModel, maxTokens }: { apiKey: string, defaultModel: string, maxTokens: number }) {
    this.apiClient = new genAI.GoogleGenAI({
      apiKey: apiKey
    });
    this.defaultModel = defaultModel;
    this.maxTokens = maxTokens;
  }
}

export const getTranslationUnconditional = async (provider: GeminiProvider, text: string, language: string) => {
    const prompt = `Please translate the following text into ${language}:
<document>
${text}
</document>

Please respond in this format:
<translation>
The completed translation
</translation>

Always give the *complete* translation, even if it is long.
`;

    const response = await provider.apiClient.models.generateContent({
        model: provider.defaultModel,
        contents: prompt,
        config: {
            maxOutputTokens: provider.maxTokens,
        }
    });

    const fullResponse = response.text || '';


    // Parse the response to extract the translation between <translation> tags
    const translationMatch = fullResponse.match(/<translation>([\s\S]*?)<\/translation>/);
    if (translationMatch && translationMatch[1]) {
        return translationMatch[1].trim();
    } else {
        console.error("Could not extract translation from response");
        throw new Error("Could not extract translation from response");
    }
}

export const getTranslationEfficient = async (provider: GeminiProvider, text: string, prevSourceText: string, prevTranslatedText: string, language: string) => {
    // Precondition: each line of "prevSourceText" corresponds to a line of "prevTranslatedText" 1:1
    // Except that there might be a trailing newline.
    // First strip any trailing newlines from the text
    const prevSourceLines = prevSourceText.trimEnd().split('\n');
    const prevTranslatedLines = prevTranslatedText.trimEnd().split('\n');

    // Sanity check:
    if (prevSourceLines.length !== prevTranslatedLines.length) {
        console.error("Previous source text and previous translated text do not have the same number of lines");
        // Fall back to unconditional translation
        return getTranslationUnconditional(provider, text, language);
    }

    
    // Use diff to find the lines that have changed
    const newSourceLines = text.trimEnd().split('\n');
    const changes = Diff.diffArrays(prevSourceLines, newSourceLines);

    console.dir(changes, { depth: null });

    // Make space for the new lines in the translated text
    const newTranslatedLines: string[] = [];
    const translationLineNeedsUpdate = new Array();
    let newTranslatedIndex = 0;
    for (const change of changes) {
        if (change.added) {
            // If lines were added, add empty lines to the translated text
            for (let i = 0; i < change.count; i++) {
                newTranslatedLines.push("");
                translationLineNeedsUpdate[newTranslatedLines.length] = true;
            }
        } else if (change.removed) {
            // If lines were removed, skip them in the translated text
            newTranslatedIndex += change.count;
        } else {
            // If lines were unchanged, copy them over
            for (let i = 0; i < change.count; i++) {
                newTranslatedLines.push(prevTranslatedLines[newTranslatedIndex]);
                translationLineNeedsUpdate[newTranslatedLines.length] = false;
                newTranslatedIndex++;
            }
        }
    }
    // Add any remaining lines from the previous translated text
    for (let i = newTranslatedIndex; i < prevTranslatedLines.length; i++) {
        newTranslatedLines.push(prevTranslatedLines[i]);
        translationLineNeedsUpdate[newTranslatedLines.length] = false;
    }

    // Find contiguous blocks of lines that need to be updated
    const blocks: { start: number, end: number }[] = [];
    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < newTranslatedLines.length; i++) {
        if (translationLineNeedsUpdate[i]) {
            if (blockStart === -1) {
                blockStart = i;
            }
            blockEnd = i;
        } else {
            if (blockStart !== -1) {
                blocks.push({ start: blockStart, end: blockEnd });
                blockStart = -1;
                blockEnd = -1;
            }
        }
    }
    if (blockStart !== -1) {
        blocks.push({ start: blockStart, end: blockEnd });
    }
    console.dir(blocks, { depth: null });

    // Loop through each block and ask the model for an updated translation, providing context lines from the previous translation
    const updatedLines: string[] = [...newTranslatedLines];

    for (const block of blocks) {
        const sourceRegionWithLinesNumbered = newSourceLines
            .slice(block.start, block.end + 1)
            .map((line, index) => `<<${block.start + index}>> ${line}`)
            .join('\n');

        const contextStart = Math.max(0, block.start - 2);
        const contextEnd = Math.min(newTranslatedLines.length, block.end + 2);
        const contextLines = newTranslatedLines.slice(contextStart, contextEnd);
        const contextWithLinesNumbered = contextLines
            .map((line, index) => `<<${contextStart + index}>> ${line}`)
            .join('\n');

        const prompt = `We are incrementally translating text into ${language}. The following region has changed in the source text:

<source>
${sourceRegionWithLinesNumbered}
</source>

Here is the context of the translation around the changed region:
<translationContext>
${contextWithLinesNumbered}
</translationContext>

Please respond in this format:




`
    }
}


const oldFunction = async (provider: GeminiProvider, text: string, prevSourceText: string, prevTranslatedText: string, language: string) => {

    // Get the diff between the previous source text and the new source text
    let patch = Diff.createPatch("source_text.txt", prevSourceText, text, null, null, { context: 3 });
    // remove "\ No newline at end of file"
    patch = patch.replace(/\\ No newline at end of file\n/g, '');
    // Remove the first 4 lines since they're just header
    //patch = patch.split('\n').slice(4).join('\n');

    const prompt = `We are translating text into ${language} as it comes in. We already have a translation, but we need to update it to account for new text. A diff representing the difference in source text is provided; translate the new text into ${language} and then update the translation by calling the \"update\" or \"replaceEntireText\" tools.

- When using \"update\", make sure that both the old_str and the new_str are in ${language} and that old_str is present verbatim in the existing translation
- When using \"update\", use the shortest possible string that uniquely identifies the text to be replaced.
- Only call \"replaceEntireText\" as a last resort, if the amount of incorrect text is large.
- Always call a tool. Make all tool calls at once in parallel; don't wait for a response before making the next call.
- Maintain whitespace; you may need to insert whitespace at the beginning or end of a line.

Existing translation (to update):\n\`\`\`\n${prevTranslatedText}\n\`\`\`

Source text diff; update the translation to correspond to this:\n\n\`\`\`\n${patch}\n\`\`\`\n

`;
  console.log('Prompt:', prompt);

  const replaceEntireTextDeclaration: genAI.FunctionDeclaration = {
    "name": "replaceEntireText",
    parameters: {
        "type": genAI.Type.OBJECT,
        "description": "Replace the entire text with a new translation",
        properties: {
            "new_str": {
                "type": genAI.Type.STRING,
                "description": "The new translation"
            }
        },
        required: [
            "new_str"
        ]
    }
  };

  const updateDeclaration: genAI.FunctionDeclaration = {
    "name": "update",
    parameters: {
        type: genAI.Type.OBJECT,
        description: "Substitute one string for another",
        properties: {
            "old_str": {
                "type": genAI.Type.STRING,
                "description": "Text to be replaced, including newline characters if needed"
            },
            "new_str": {
                "type": genAI.Type.STRING,
                "description": "Text to replace old_str with, including newline characters if needed"
            }
        },
        required: [
            "old_str",
            "new_str"
        ]
    }
  };
  const response = await provider.apiClient.models.generateContent({
    model: provider.defaultModel,
    contents: prompt,
    config: {
        toolConfig: {
            functionCallingConfig: {
                mode: genAI.FunctionCallingConfigMode.ANY,
                allowedFunctionNames: [replaceEntireTextDeclaration.name!, updateDeclaration.name!],
            },
        },
        tools: [{functionDeclarations: [replaceEntireTextDeclaration, updateDeclaration]}],
    }
    });

  const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
        console.error("No function calls in response");
        console.dir(response, { depth: null });
        throw new Error("No function calls in response");
    }
  console.dir(functionCalls, { depth: null });

  // The tools assumed that prevTranslatedText ended with a newline, so we add one here if it doesn't
  if (prevTranslatedText.length > 0 && prevTranslatedText[prevTranslatedText.length - 1] !== '\n') {
    prevTranslatedText += '\n';
  }

  let newTranslatedText = prevTranslatedText
  for (const functionCall of functionCalls) {
    // Check if the function call is valid
    if (!functionCall.name || !functionCall.args) {
        console.error("Invalid function call:", functionCall);
        throw new Error("Invalid function call");
    }
    if (functionCall.name === "replaceEntireText") {
        const newStr: string = functionCall.args.new_str as string;
        if (!newStr) {
            console.error("No new_str in function call");
            throw new Error("No new_str in function call");
        }
        console.log(`Replacing entire text.`);
        newTranslatedText = newStr;
    }
    else if (functionCall.name === "update") {
        newTranslatedText = applyUpdateTool(functionCall.args.old_str as string, functionCall.args.new_str as string, newTranslatedText);
    }
    else {
        console.error(`Unexpected function name: ${functionCall.name}`);
        throw new Error(`Unexpected function name: ${functionCall.name}`);
    }
  }

  return newTranslatedText;

}

function applyUpdateTool(oldStr: string, newStr: string, prevTranslatedText: string): string {
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
