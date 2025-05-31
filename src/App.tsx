import React from 'react';
import { useConnectionStatus, useYDoc, YDocProvider } from '@y-sweet/react';
import { useRef, useState } from 'react';
import './App.css';

import ProseMirrorEditor from './ProseMirrorEditor';
import TranslationControls from './TranslationControls';

import { useAtom } from 'jotai';
import { fontSizeAtom, languageAtom, availableLayouts, selectedLayoutKeyAtom, isEditorAtom } from './configAtoms';
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


function AppInner() {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const sourceTextRef = useRef("");
  const languages = ["Spanish", "French", "Haitian Creole"];
  const [displayedLanguage] = useAtom(languageAtom);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [fontSize] = useAtom(fontSizeAtom);
  const [selectedLayoutKey] = useAtom(selectedLayoutKeyAtom);
  const [isEditor] = useAtom(isEditorAtom);

  const {
    isTranslating,
    translationError,
    doTranslations,
    doResetTranslations,
  } = useTranslationManager({
    languages,
    sourceTextRef,
  });

  const selectedLayoutObj = availableLayouts.find(l => l.key === selectedLayoutKey) || availableLayouts[0];
  const selectedLayout = selectedLayoutObj.layout;

  // Derive the set of all possible component keys from the layouts
  type ComponentKey = typeof availableLayouts[number]["layout"][number][number];
  // Helper type to ensure all keys are present
  type ComponentMapType = { [K in ComponentKey]: () => React.ReactNode };

  // Map component keys to render functions (typechecked)
  const componentMap: ComponentMapType = {
    transcriber: () => isEditor ? <SpeechTranscriber /> : null,
    transcript: () => (
      <div className="flex-1/2 overflow-auto p-4 touch-pan-y"><TranscriptViewer /></div>
    ),
    sourceText: () => (
      <div className="flex-1/2 overflow-auto p-4">
        <ProseMirrorEditor
          yDoc={ydoc}
          onTextChanged={isEditor ? (val => { sourceTextRef.current = val; }) : () => null}
          editable={isEditor}
          onTranslationTrigger={doTranslations}
        />
      </div>
    ),
    translationControls: () => isEditor ? (
      <TranslationControls
        translationError={translationError}
        isTranslating={isTranslating}
        onReset={doResetTranslations}
        onTranslate={doTranslations}
      />
    ) : null,
    translatedText: () => (
      <div className="flex-1/2 bg-red-950 text-white p-2 touch-pan-y">
        <TranslatedTextViewer yJsKey={translatedTextKeyForLanguage(displayedLanguage)} fontSize={fontSize} />
      </div>
    ),
  };

  // Render layout columns, filtering out editor-only components at render time if not in editor mode
  const columns = selectedLayout.map((col, i) => {
    const editorOnlyKeys = ["transcriber", "translationControls"];
    // If not editor, filter out editor-only components
    const filteredCol = isEditor ? col : col.filter(key => !editorOnlyKeys.includes(key));
    // Don't render empty columns
    if (filteredCol.length === 0) return null;
    return (
      <div
        key={i}
        className={
          selectedLayout.length === 1
            ? 'w-full h-full'
            : 'flex flex-col w-full md:w-1/2 h-1/2 md:h-full'
        }
      >
        {filteredCol.map((key, j) => (
          <React.Fragment key={key + j}>{componentMap[key]()}</React.Fragment>
        ))}
      </div>
    );
  });

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
      {columns}
    </div>
  );
}

const App = () => {
  const docId = "doc8";
  // We're an editor only if location hash includes #editor
  const isEditor = window.location.hash.includes("editor");
  // Set the atom value for isEditor
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
      <AppInner />
    </YDocProvider>
  );
};

export default App;
