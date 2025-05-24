import './App.css';
import { useState, useEffect, useRef } from 'react';
import { useConnectionStatus, useMap, useYDoc, YDocProvider } from '@y-sweet/react';

import ProseMirrorEditor from './ProseMirrorEditor';
import { Remark } from 'react-remark';
import { ConfigProvider, useConfig } from './ConfigContext';
import ConfigPanel from './ConfigPanel';
import SpeechTranscriber from './SpeechTranscriber';
import { useAsPlainText } from './yjsUtils';
import { getTranslationTodos, getDecomposedChunks, GenericMap, TranslationCache } from './translationUtils';


function useScrollToBottom(ref: React.RefObject<HTMLDivElement | null>, deps: any[]) {
  useEffect(() => {
    setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
  }, deps);
}

function ConnectionStatusWidget({ connectionStatus }: { connectionStatus: string }) {
  return <div className={`px-1 py-1 rounded-full text-xs font-medium ${
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
    </div>;
}

function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-ignore
  window['ydoc'] = ydoc; // For debugging purposes
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
  
  const translatedTextEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useScrollToBottom(translatedTextEndRef, [translatedText]);
  useScrollToBottom(transcriptEndRef, [transcript]);

  async function doTranslation() {
    const decomposedChunks = getDecomposedChunks(text);
    const translationTodos = getTranslationTodos(decomposedChunks, translationCache as GenericMap as TranslationCache);

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
      if (!response.ok || !result?.ok) {
        // If we have a JSON result with error details, include them in the error message
        if (result?.error) {
          setTranslationError(`Translation error (${response.status}): ${result.error}`);
        } else {
          setTranslationError(`HTTP error! Status: ${response.status}`);
        }
        setIsTranslating(false);
        return;
      }

      // For each block, the server gave us a list of updated chunks, which we can use to update the translation cache.
      const translationResults = result.results as { sourceText: string; translatedText: string; }[][];
      for (const block of translationResults) {
        for (const result of block) {
          const { sourceText, translatedText } = result;
          // There shouldn't be anything to trim, but just in case, trim the source and translated text.
          const trimmedSourceText = sourceText.trim();
          const trimmedTranslatedText = translatedText.trim();
          if (sourceText !== trimmedSourceText) {
            console.warn('Source text was trimmed:', [sourceText, trimmedSourceText]);
          }
          if (translatedText !== trimmedTranslatedText) {
            console.warn('Translated text was trimmed:', [translatedText, trimmedTranslatedText]);
          }
          // Update the translation cache with the new translation
          translationCache.set(trimmedSourceText, trimmedTranslatedText);
        }
      }
    }

    // Finally, reconstruct the translated text.
    const translatedText = decomposedChunks.map((chunk) => {
      const cachedTranslation = translationCache.get(chunk.content) as string | undefined;
      let content = cachedTranslation;
      if (!cachedTranslation) {
        if (chunk.content.trim() !== '')
          // It's ok if we ended up with an empty chunk.
          console.warn('No cached translation for chunk:', chunk);
        // Fallback to the original content
        content = chunk.content;
      }
      return chunk.format + content + chunk.trailingWhitespace;
    }).join('\n');

    setTranslatedText(translatedText);
    setIsTranslating(false);
  }

  const leftSideShown = isEditor || showOriginalText || showTranscript;
  const translationLayoutClasses = leftSideShown ? `w-full md:w-1/2 h-1/2 md:h-full` : `w-full h-full`;

  const leftContent = <>
  {isEditor && <SpeechTranscriber onTranscript={setTranscript} />}
  {showTranscript &&
    <div className="flex-1/2 overflow-auto p-4 touch-pan-y">
      {transcript.split('\n').map((x, i) => <div key={i}>{x}</div>)}
      <div ref={transcriptEndRef} />
    </div>
  }
  {showOriginalText && 
    <div className="flex-1/2 overflow-auto p-4">
      <ProseMirrorEditor yDoc={ydoc} onTextChanged={isEditor ? setText : () => null} editable={isEditor} onTranslationTrigger={() => doTranslation()}/>
    </div>
  }
  {isEditor && <div className="flex justify-end p-4 bg-white border-t">
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
        translationCache.clear();
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
  </>;

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
        <ConnectionStatusWidget connectionStatus={connectionStatus} />
      </div>
      {showConfigPanel && <ConfigPanel onClose={() => setShowConfigPanel(false)} />}
      {(leftSideShown) && <div className="flex flex-col w-full md:w-1/2 h-1/2 md:h-full">
        {leftContent}
      </div>}
      <div className={`${translationLayoutClasses} bg-red-950 text-white p-2 overflow-auto pb-16 touch-pan-y`} style={{ fontSize: `${fontSize}px` }}>
        {isEditor && translationError && (
          <div className="p-4 mb-4 bg-red-800 text-white rounded-md">
            <p className="font-bold">Translation Error:</p>
            <p>{translationError}</p>
          </div>
          )}
          <div>
            <Remark>
              {translatedText}
            </Remark>
            <div ref={translatedTextEndRef} />
          </div>
      </div>
    </div>
  );
}

const App = () => {
  const docId = "doc7";
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
