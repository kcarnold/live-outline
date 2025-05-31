import { useConnectionStatus, useYDoc, YDocProvider } from '@y-sweet/react';
import React, { useRef } from 'react';
import './App.css';

import ProseMirrorEditor from './ProseMirrorEditor';
import TranslationControls from './TranslationControls';

import { useAtom } from 'jotai';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { availableLayouts, fontSizeAtom, isEditorAtom } from './configAtoms';
import { LayoutDiagram } from './LayoutDiagram';
import { useScrollToBottom } from './reactUtils';
import SpeechTranscriber from './SpeechTranscriber';
import TranslatedTextViewer from './TranslatedTextViewer';
import { translatedTextKeyForLanguage } from './translationUtils';
import { useTranslationManager } from './useTranslationManager';
import { useAsPlainText } from './yjsUtils';


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
  return <div className="overflow-auto pb-4 leading-tight">
      {transcriptWithoutPunctuation.split('\n').map((x, i) => <div key={i}>{x}</div>)}
      <div ref={transcriptEndRef} />
  </div>
}



// Home page: list all layouts and languages as links
function HomePage() {
  const languages = ["Spanish", "French", "Haitian Creole"];
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-950 dark:to-gray-900">
      <h1 className="text-2xl font-bold mb-6 mt-8">Live Outline: Choose Language & Layout</h1>
      <div className="flex flex-col gap-6 w-full max-w-xl">
        {availableLayouts.map(layout => (
          <div key={layout.key} className="bg-white/80 dark:bg-gray-800/80 rounded shadow p-4">
            <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
              <LayoutDiagram layout={layout.layout} />
              <div className="flex flex-row gap-2">
              {languages.map(lang => (
                <div key={lang} className="flex items-center gap-2">
                  <Link
                    to={`/${layout.key}/${encodeURIComponent(lang)}`}
                    className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition text-sm"
                    >
                    {lang}
                  </Link>
                </div>
              ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Layout page: render the selected layout and language from URL
function LayoutPage() {
  const { layoutKey, language } = useParams();
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const sourceTextRef = useRef("");
  const [fontSize] = useAtom(fontSizeAtom);
  const [isEditor] = useAtom(isEditorAtom);
  const navigate = useNavigate();
  const languages = ["Spanish", "French", "Haitian Creole"];

  // If invalid layout or language, redirect to home
  const selectedLayoutObj = availableLayouts.find(l => l.key === layoutKey);
  if (!selectedLayoutObj || !language || !languages.includes(language)) {
    navigate("/", { replace: true });
    return null;
  }
  const selectedLayout = selectedLayoutObj.layout;

  const {
    isTranslating,
    translationError,
    doTranslations,
    doResetTranslations,
  } = useTranslationManager({
    languages,
    sourceTextRef,
  });

  // Derive the set of all possible component keys from the layouts
  type ComponentKey = typeof availableLayouts[number]["layout"][number][number];
  type ComponentMapType = { [K in ComponentKey]: () => React.ReactNode };

  const cardClass =
    "rounded-md shadow bg-gray-100/80 dark:bg-gray-800/80 p-2 mb-2 flex flex-col gap-1 transition hover:shadow-lg";
  const componentMap: ComponentMapType = {
    transcript: () => (
      <div className={cardClass + " flex-1/2 overflow-auto bg-gray-50/80 dark:bg-gray-900/60 text-black dark:text-gray-200"}>
        {isEditor ? <SpeechTranscriber /> : <h2 className="font-semibold text-xs text-gray-600 dark:text-gray-300 leading-tight">Transcript</h2>}
        <TranscriptViewer />
      </div>
    ),
    sourceText: () => (
      <>
        <div className={cardClass + " flex-1/2 overflow-auto bg-white/70 dark:bg-gray-900/70"}>
          <h2 className="font-semibold text-xs text-gray-600 dark:text-gray-300 leading-tight">Source Text</h2>
          <ProseMirrorEditor
            yDoc={ydoc}
            onTextChanged={isEditor ? (val => { sourceTextRef.current = val; }) : () => null}
            editable={isEditor}
            onTranslationTrigger={isEditor ? doTranslations: () => null}
          />
        </div>
        {isEditor ? (
          <div className={cardClass + " flex justify-center min-h-[36px]"}>
            <TranslationControls
              translationError={translationError}
              isTranslating={isTranslating}
              onReset={doResetTranslations}
              onTranslate={doTranslations}
            />
          </div>
        ) : null
        }
      </>
    ),
    translatedText: () => (
      <div className={cardClass + " flex-1/2 bg-gray-100/80 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100"}>
        <h2 className="font-semibold text-xs text-gray-500 dark:text-gray-300 leading-tight">Translation</h2>
        <TranslatedTextViewer yJsKey={translatedTextKeyForLanguage(language)} fontSize={fontSize} />
      </div>
    ),
  };

  // Render layout columns, filtering out editor-only components at render time if not in editor mode
  const columns = selectedLayout.map((col, i) => {
    if (col.length === 0) return null;
    return (
      <div
        key={i}
        className={
          selectedLayout.length === 1
            ? 'w-full h-full flex flex-col gap-2 p-2'
            : 'flex flex-col w-full md:w-1/2 h-1/2 md:h-full gap-2 p-1'
        }
      >
        {col.map((key, j) => (
          <React.Fragment key={key + j}>{componentMap[key]()}</React.Fragment>
        ))}
      </div>
    );
  });

  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden relative touch-none bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-950 dark:to-gray-900">
      <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
        <ConnectionStatusWidget connectionStatus={connectionStatus} />
        <Link
          to="/"
          className="bg-gray-200 dark:bg-gray-800 p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 shadow border border-gray-300 dark:border-gray-700 text-xl transition"
          title="Home"
        >
          🏠
        </Link>
      </div>
      {columns}
    </div>
  );
}

const App = () => {
  const docId = "doc9";
  // We're an editor only if location hash includes #editor
  const isEditor = window.location.hash.includes("editor");
  const [, setIsEditor] = useAtom(isEditorAtom);
  React.useEffect(() => {
    setIsEditor(isEditor);
  }, [isEditor, setIsEditor]);
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:layoutKey/:language" element={<LayoutPage />} />
      </Routes>
    </YDocProvider>
  );
};

export default App;
