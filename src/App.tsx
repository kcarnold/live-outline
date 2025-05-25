import './App.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConnectionStatus, useMap, useYDoc, YDocProvider } from '@y-sweet/react';

import ProseMirrorEditor from './ProseMirrorEditor';
import { Remark } from 'react-remark';
import { useAtom } from 'jotai';
import { showOriginalTextAtom, fontSizeAtom, showTranscriptAtom } from './configAtoms';
import ConfigPanel from './ConfigPanel';
import SpeechTranscriber from './SpeechTranscriber';
import { useAsPlainText } from './yjsUtils';
import { getTranslationTodos, getDecomposedChunks, GenericMap, TranslationCache, constructTranslatedText, updateTranslationCache } from './translationUtils';


function useScrollToBottom(ref: React.RefObject<HTMLDivElement | null>, deps: React.DependencyList) {
  useEffect(() => {
    setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function TranscriptViewer() {
  const [transcript] = useAsPlainText("transcript");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useScrollToBottom(transcriptEndRef, [transcript]);

  return <>
      {transcript.split('\n').map((x, i) => <div key={i}>{x}</div>)}
      <div ref={transcriptEndRef} />
  </>
}

function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const [text, setText] = useState("");
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
  const [showOriginalText] = useAtom(showOriginalTextAtom);
  const [fontSize] = useAtom(fontSizeAtom);
  const [showTranscript] = useAtom(showTranscriptAtom);
  
  const translatedTextEndRef = useRef<HTMLDivElement | null>(null);
  
  useScrollToBottom(translatedTextEndRef, [translatedText]);

  const doTranslation = useCallback(async function doTranslation(language: string) {
    const decomposedChunks = getDecomposedChunks(text);
    const translationTodos = getTranslationTodos(language, decomposedChunks, translationCache as GenericMap as TranslationCache);

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
          language: language,
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
      updateTranslationCache(result, translationCache as GenericMap as TranslationCache);
    }

    setTranslatedText(constructTranslatedText(language, decomposedChunks, translationCache as GenericMap as TranslationCache));
    setIsTranslating(false);
  }, [text, translationCache, setTranslatedText]);

  const doTranslations = useCallback(() => {
    return Promise.all([doTranslation(language)]);
  }, [language, doTranslation]);


  const leftSideShown = isEditor || showOriginalText || showTranscript;
  const translationLayoutClasses = leftSideShown ? `w-full md:w-1/2 h-1/2 md:h-full` : `w-full h-full`;

  const leftContent = <>
  {isEditor && <SpeechTranscriber />}
  {showTranscript &&
    <div className="flex-1/2 overflow-auto p-4 touch-pan-y">
      <TranscriptViewer />
    </div>
  }
  {showOriginalText && 
    <div className="flex-1/2 overflow-auto p-4">
      <ProseMirrorEditor yDoc={ydoc} onTextChanged={isEditor ? setText : () => null} editable={isEditor} onTranslationTrigger={doTranslations}/>
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
      onClick={doTranslations}
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
          onClick={() => { setShowConfigPanel(!showConfigPanel); }}
          className="bg-gray-200 p-1 rounded-full hover:bg-gray-300"
          title="Settings"
        >
          ⚙️
        </button>
        <ConnectionStatusWidget connectionStatus={connectionStatus} />
      </div>
      {showConfigPanel && <ConfigPanel onClose={() => { setShowConfigPanel(false); }} />}
      {(leftSideShown) && <div className="flex flex-col w-full md:w-1/2 h-1/2 md:h-full">
        {leftContent}
      </div>}
      <div className={`${translationLayoutClasses} bg-red-950 text-white p-2 overflow-auto pb-16 touch-pan-y`} style={{ fontSize: `${fontSize}px` }}>
        {isEditor && (translationError !== "") && (
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
    <YDocProvider docId={docId} authEndpoint={authEndpoint}>
      <AppInner isEditor={isEditor} />
    </YDocProvider>
  );
};

export default App;
