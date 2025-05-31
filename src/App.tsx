import './App.css';
import { useState, useRef, useCallback } from 'react';
import { useConnectionStatus, useMap, useYDoc, YDocProvider } from '@y-sweet/react';


import ProseMirrorEditor from './ProseMirrorEditor';
import TranslationControls from './TranslationControls';

import TranslatedTextViewer from './TranslatedTextViewer';
import { useAtom } from 'jotai';
import { showOriginalTextAtom, fontSizeAtom, showTranscriptAtom, languageAtom } from './configAtoms';
import ConfigPanel from './ConfigPanel';
import SpeechTranscriber from './SpeechTranscriber';
import { setYTextFromString, useAsPlainText } from './yjsUtils';
import { GenericMap, TranslationCache, getUpdatedTranslation } from './translationUtils';
import { useScrollToBottom } from './reactUtils';


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

  const transcriptWithoutPunctuation = transcript.replace(/[.,]/g, '');
  return <>
      {transcriptWithoutPunctuation.split('\n').map((x, i) => <div key={i}>{x}</div>)}
      <div ref={transcriptEndRef} />
  </>
}


const translatedTextKeyForLanguage = (language: string) => `translatedText-${language}`;


function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const textRef = useRef("");
  const languages = ["Spanish", "French", "Haitian Creole"];
  const [displayedLanguage] = useAtom(languageAtom);
  const translationCache = useMap("translationCache");
  const [isTranslating, setIsTranslating] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [showOriginalText] = useAtom(showOriginalTextAtom);
  const [fontSize] = useAtom(fontSizeAtom);
  const [showTranscript] = useAtom(showTranscriptAtom);

  const doTranslations = useCallback(async () => {
    async function doTranslation(language: string) {
      const updatedText = await getUpdatedTranslation(language, translationCache as GenericMap as TranslationCache, textRef.current);
      const key = translatedTextKeyForLanguage(language);
      setYTextFromString(ydoc.getText(key), updatedText);
    }

    setIsTranslating(true);
    setTranslationError("");

    try {
      await Promise.all(languages.map(language => doTranslation(language)));
    }
    catch (error) {
      console.error("Error during translation:", error);
      setTranslationError(error instanceof Error ? error.message : "Unknown error");
    }
    finally {
      setIsTranslating(false);
    }
  }, [setTranslationError, translationCache]);

  const doResetTranslations = useCallback(() => {
      for (const lang of languages) {
        const key = translatedTextKeyForLanguage(lang);
        const text = ydoc.getText(key);
        if (text) {
          text.delete(0, text.length);
        }
      }
      translationCache.clear();
      setTranslationError("");
  }, [translationCache, ydoc]);

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
      <ProseMirrorEditor
        yDoc={ydoc}
        onTextChanged={isEditor ? (val => { textRef.current = val; }) : () => null}
        editable={isEditor}
        onTranslationTrigger={doTranslations}
      />
    </div>
  }
  {isEditor && (
    <TranslationControls
      translationError={translationError}
      isTranslating={isTranslating}
      onReset={doResetTranslations}
      onTranslate={doTranslations}
    />
  )}
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
          <TranslatedTextViewer yJsKey={translatedTextKeyForLanguage(displayedLanguage) } />
      </div>
    </div>
  );
}

const App = () => {
  const docId = "doc8";
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
