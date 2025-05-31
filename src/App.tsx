import { useConnectionStatus, useYDoc, YDocProvider } from '@y-sweet/react';
import { useRef, useState } from 'react';
import './App.css';

import ProseMirrorEditor from './ProseMirrorEditor';
import TranslationControls from './TranslationControls';

import { useAtom } from 'jotai';
import { fontSizeAtom, languageAtom, showOriginalTextAtom, showTranscriptAtom } from './configAtoms';
import ConfigPanel from './ConfigPanel';
import SpeechTranscriber from './SpeechTranscriber';
import TranslatedTextViewer from './TranslatedTextViewer';
import { useAsPlainText } from './yjsUtils';

import { useScrollToBottom } from './reactUtils';
import { translatedTextKeyForLanguage } from './translationUtils';
import { useTranslationManager } from './useTranslationManager';


function ConnectionStatusWidget({ connectionStatus }: { connectionStatus: string }) {
  if (connectionStatus === 'connected') {
    // Very compact: just a green dot
    return (
      <div className="w-3 h-3 bg-green-500 rounded-full border border-white" title="Connected" />
    );
  }
  return (
    <div className={`px-1 py-1 rounded-full text-xs font-medium ${
      connectionStatus === 'connecting'
        ? 'bg-yellow-500 text-white'
        : 'bg-red-500 text-white'
    }`}>
      {connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
    </div>
  );
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


function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const textRef = useRef("");
  const languages = ["Spanish", "French", "Haitian Creole"];
  const [displayedLanguage] = useAtom(languageAtom);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showOriginalText] = useAtom(showOriginalTextAtom);
  const [fontSize] = useAtom(fontSizeAtom);
  const [showTranscript] = useAtom(showTranscriptAtom);


  const {
    isTranslating,
    translationError,
    doTranslations,
    doResetTranslations,
  } = useTranslationManager({
    languages,
    textRef,
  });

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
        <ConnectionStatusWidget connectionStatus={connectionStatus} />
        <button
          onClick={() => { setShowConfigPanel(!showConfigPanel); }}
          className="bg-gray-200 p-1 rounded-full hover:bg-gray-300"
          title="Settings"
        >
          ⚙️
        </button>
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
