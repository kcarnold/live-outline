import './App.css';
import { useState, useEffect, useRef } from 'react';
import { useConnectionStatus, useMap, useText, useYDoc, YDocProvider } from '@y-sweet/react';
import diff from 'fast-diff';

import ProseMirrorEditor from './ProseMirrorEditor';
import { Remark } from 'react-remark';
import { ConfigProvider, useConfig } from './ConfigContext';
import ConfigPanel from './ConfigPanel';
import SpeechTranscriber from './SpeechTranscriber';

// Hook based on implementation here https://discuss.yjs.dev/t/plain-text-input-component-with-y-text/2358/2
const useAsPlainText = (name: string): [string, (newText: string) => void] => {
  const sharedText = useText(name);
  const [text, setText] = useState(sharedText.toString());
  
  useEffect(() => {
    const observer = () => {
      setText(sharedText.toString());
    };
    
    sharedText.observe(observer);
    return () => sharedText.unobserve(observer);
  }, [sharedText]);

  const setPlainText = (newText: string) => {
    // Get the current text value directly from sharedText instead of using potentially stale state
    const currentText = sharedText.toString();
    const delta = diffToDelta(diff(currentText, newText));
    sharedText.applyDelta(delta);
  };
  
  return [text, setPlainText];
};

function diffToDelta(diffResult: diff.Diff[]): any[] {
  return diffResult.map(([op, value]) => {
    if (op === diff.INSERT) 
      return { insert: value };
    if (op === diff.DELETE)
      return { delete: value.length };
    if (op === diff.EQUAL)
      return { retain: value.length };
    console.error('Unknown diff operation:', op);
    return null;
  });
}

function portWhitespace(src: string, dest: string) {
  if (dest.trim() !== dest) {
    console.warn('Destination text has leading or trailing whitespace:', dest);
  }
  const whitespaceBefore = src.length - src.trimStart().length;
  const whitespaceAfter = src.length - src.trimEnd().length;
  return src.slice(0, whitespaceBefore) + dest + src.slice(src.length - whitespaceAfter);
}


function findContiguousBlocks(arr: any[]) {
  const blocks = [];
  let start = -1;
  
  for (let i = 0; i < arr.length; i++) {
    // If we find a truthy value and we're not already in a block, mark the start
    if (arr[i] && start === -1) {
      start = i;
    }
    
    // If we find a falsy value and we were in a block, or we're at the end of the array and in a block
    if ((!arr[i] || i === arr.length - 1) && start !== -1) {
      // If we're at the end of the array and the last element is truthy, we need to include it
      const end = arr[i] ? i : i - 1;
      blocks.push([start, end]);
      start = -1; // Reset start to indicate we're not in a block
    }
  }
  
  return blocks;
}


function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useAsPlainText("transcript");
  const [translatedText, setTranslatedText] = useAsPlainText("translatedText");
  const sharedMeta = useMap("meta");
  const language = sharedMeta.get("language") as string || "Spanish";
  const setLanguage = (newLanguage: string) => {
    sharedMeta.set("language", newLanguage);
  };
  const translationCache = useMap("translationCache");
  const [isTranslating, setIsTranslating] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const { showOriginalText, fontSize, showTranscript } = useConfig();
  
  const translatedTextContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  const leftSideShown = isEditor || showOriginalText;
  const translationLayoutClasses = leftSideShown ? `w-full md:w-1/2 h-1/2 md:h-full` : `w-full h-full`;

  useEffect(() => {
    // Needs a delay to ensure the scroll happens after the DOM has updated
    setTimeout(() => {
      if (translatedTextContainerRef.current) {
        translatedTextContainerRef.current.scrollTop = translatedTextContainerRef.current.scrollHeight;
      }
    }, 100);
  }, [translatedText]);

  // Also scroll the transcript area
  useEffect(() => {
    setTimeout(() => {
      if (showTranscript && transcriptContainerRef.current) {
        transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
      }
    }, 100);
  }, [transcript]);
  

  const doTranslation = async () => {
    // Split the input into chunks (for first pass, just do by line)
    let chunks = text.split('\n');
    console.log('Chunks:', chunks);

    // Whitespace is annoying, so consolidate any whitespace-only chunk into the previous chunk.
    chunks = chunks.reduce((acc: string[], chunk: string) => {
      if (acc.length === 0) {
        // First chunk, just add it
        acc.push(chunk);
        return acc;
      }
      if (chunk.trim() === '') {
        acc[acc.length - 1] += '\n' + chunk;
      }
      else {
        // It's possible that the first chunk was whitespace-only.
        // In that case, we need to add it to the previous chunk.
        if (acc[acc.length - 1].trim() === '') {
          acc[acc.length - 1] += '\n' + chunk;
        } else {
          // Otherwise, just add it as a new chunk
          acc.push(chunk);
        }
      }
      return acc;
    }, []);

    console.log('Consolidated chunks:', chunks);

    // Assert that all chunks are non-empty
    for (const chunk of chunks) {
      if (chunk.trim() === '') {
        console.error('Empty chunk found:', chunk);
      }
    }

    // Make an array where each entry is:
    // 0: don't include
    // 1: need to translate
    // 2: included only for context
    
    // The keys of the translation cache are always the trimmed chunks.
    const chunkStatus = chunks.map((chunk) => {
      return translationCache.has(chunk.trim()) ? 0 : 1;
    });

    // Mark a few lines before each "need to translate" chunk as "context"
    for (let i = 0; i < chunkStatus.length; i++) {
      if (chunkStatus[i] === 1) {
        // Mark the previous few lines as context
        for (let j = 1; j <= 3; j++) {
          if (i - j >= 0 && chunkStatus[i - j] === 0) {
            // @ts-ignore
            chunkStatus[i - j] = 2;
          }
        }
      }
    }

    // Create contiguous blocks of text to translate
    const translationTodoBlocks = findContiguousBlocks(chunkStatus);
    console.log('Translation todo blocks:', translationTodoBlocks);

    // Now make a to-do list for all translations to request. Translations will get requested in blocks, where
    // each block is a contiguous range of chunks that need to be translated.

    type TranslationTodo = {
      chunks: string[];
      offset: number;
      isTranslationNeeded: boolean[];
      translatedContext: string;
    }

    const translationTodos: TranslationTodo[] = [];
    for (const block of translationTodoBlocks) {
      const [start, end] = block;
      const chunksInContext = chunks.slice(start, end + 1);
      const statusesInContext = chunkStatus.slice(start, end + 1);
      const translatedContext = chunksInContext.map((chunk) => {
        const cachedTranslation = translationCache.get(chunk.trim()) as string | undefined;
        if (cachedTranslation) {
          return portWhitespace(chunk, cachedTranslation);
        }
        return '';
      }).join('\n');
      const isTranslationNeeded = statusesInContext.map(x => x === 1);
      translationTodos.push({
        chunks: chunksInContext,
        offset: start,
        isTranslationNeeded,
        translatedContext,
      });
    }
    console.log('Translation todos:', translationTodos);

    if (translationTodos.length > 0) {
      setIsTranslating(true);
      setTranslationError("");
      const response = await fetch('/api/requestTranslatedBlocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          translationTodos,
          languages: [language],
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result.ok) {
        // If we have a JSON result with error details, include them in the error message
        if (result && result.error) {
          setTranslationError(`Translation error (${response.status}): ${result.error}`);
        } else {
          setTranslationError(`HTTP error! Status: ${response.status}`);
        }
        setIsTranslating(false);
        return;
      }

      // For each block, the server gave us a list of updated chunks, which we can use to update the translation cache.
      const translationResults = result.results as { sourceText: string, translatedText: string }[][];
      console.log('Translation results:', translationResults);
      for (const block of translationResults) {
        for (const result of block) {
          const { sourceText, translatedText } = result;
          const trimmedSourceText = sourceText.trim();
          const trimmedTranslatedText = translatedText.trim();
          translationCache.set(trimmedSourceText, trimmedTranslatedText);
        }
      }
    }
    
    // Finally, reconstruct the translated text.
    const translatedText = chunks.map((chunk) => {
      const cachedTranslation = translationCache.get(chunk.trim()) as string | undefined;
      if (cachedTranslation) {
        const result = portWhitespace(chunk, cachedTranslation);
        console.log('Cached translation for chunk:', [chunk, cachedTranslation, result]);
        return result;
      } else {
        console.warn('No cached translation for chunk:', chunk);
        return chunk;
      }
    }).join('\n');

    console.log('Translated text:', translatedText);
    setTranslatedText(translatedText);
    setIsTranslating(false);
  };

  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden relative touch-none">
      <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
        <button
          onClick={() => setShowConfigPanel(!showConfigPanel)}
          className="bg-gray-200 p-1 rounded-full hover:bg-gray-300"
          title="Settings"
        >
          ⚙️
        </button>
        <div className={`px-1 py-1 rounded-full text-xs font-medium ${
          connectionStatus === 'connected' 
            ? 'bg-green-500 text-white' 
            : connectionStatus === 'connecting' 
            ? 'bg-yellow-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {connectionStatus === 'connected' 
            ? 'Connected' 
            : connectionStatus === 'connecting' 
            ? 'Connecting...' 
            : 'Disconnected'}
        </div>
      </div>
      {showConfigPanel && <ConfigPanel onClose={() => setShowConfigPanel(false)} />}
      {(leftSideShown) && <div className="flex flex-col w-full md:w-1/2 h-1/2 md:h-full">
        {isEditor && <SpeechTranscriber onTranscript={setTranscript} />}
        <div className="flex-grow overflow-auto p-4 touch-pan-y" ref={transcriptContainerRef}>
        {showTranscript ?
          <div>{transcript.split('\n').map((x, i) => <div key={i}>{x}</div>)}</div> :
          <ProseMirrorEditor yDoc={ydoc} onTextChanged={isEditor ? setText : () => null} editable={isEditor} onTranslationTrigger={() => doTranslation()}/>
        }
        </div>
        {isEditor && <div className="flex justify-end p-4 bg-white border-t sticky bottom-0">
          {/* Language selector */}
          <select 
            className="bg-white text-black font-medium py-2 px-4 rounded mr-2"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
            }}
          >
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="Haitian Creole">Haitian Creole</option>
          </select>
          <button 
            className="bg-gray-600 text-white font-medium py-2 px-4 rounded hover:bg-gray-700 transition-colors mr-2"
            onClick={() => {
              setTranslatedText("");
              setTranslationError("");
            }}
          >
            Reset
          </button>
          <button 
            className={`text-white font-medium py-2 px-4 rounded transition-colors ${isTranslating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            onClick={doTranslation}
            disabled={isTranslating}
          >
            {isTranslating ? 'Translating...' : 'Translate'}
          </button>
        </div> }
      </div>}
      <div className={`${translationLayoutClasses} bg-red-950 text-white p-2 overflow-auto pb-16 touch-pan-y`} ref={translatedTextContainerRef} style={{ fontSize: `${fontSize}px` }}>
        {translationError ? (
          <div className="p-4 mb-4 bg-red-800 text-white rounded-md">
            <p className="font-bold">Translation Error:</p>
            <p>{translationError}</p>
          </div>
        ) : (
          <Remark>
            {translatedText}
          </Remark>
        )}
      </div>
    </div>
  );
}

const App = () => {
  const docId = "doc2";
  // We're an editor only if location hash includes #editor
  const isEditor = window.location.hash.includes("editor");
  const authEndpoint = async () => {
    const response = await fetch('/api/ys-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, isEditor }),
    });
    return await response.json();
  };
  
  return (
    <ConfigProvider>
      <YDocProvider docId={docId} authEndpoint={authEndpoint}>
        <AppInner isEditor={isEditor} />
      </YDocProvider>
    </ConfigProvider>
  );
};

export default App;
