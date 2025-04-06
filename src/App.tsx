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

type TranslationResponse = {
  ok: boolean,
  translatedText: string,
  text: string
};

async function getUpdatedTranslation(text: string, prevText: string, translatedText: string, language: string, options: {}): Promise<TranslationResponse> {
  const response = await fetch('/api/requestTranslation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      prevText: prevText,
      prevTranslatedText: translatedText,
      language,
      efficientMode: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Translation failed: ${result.error}`);
  }
  return {
    ok: true,
    translatedText: result.translatedText,
    text: result.text
  };
}


function AppInner({isEditor}: {isEditor: boolean}) {
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useAsPlainText("transcript");
  const [translatedText, setTranslatedText] = useAsPlainText("translatedText");
  const [lastTranslatedText, setLastTranslatedText] = useAsPlainText("lastTranslatedText");
  const sharedMeta = useMap("meta");
  const language = sharedMeta.get("language") as string || "Spanish";
  const setLanguage = (newLanguage: string) => {
    sharedMeta.set("language", newLanguage);
  };
  const [isTranslating, setIsTranslating] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
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
      if (transcriptContainerRef.current) {
        transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
      }
    }, 100);
  }, [transcript]);
  


  const doTranslation = async () => {
    if (!text || !language) {
      console.warn('Text or language not set, skipping translation');
      return;
    }
    if (isTranslating) return;
    
    setIsTranslating(true);
    try {
      const response = await getUpdatedTranslation(text, lastTranslatedText, translatedText, language, { efficientMode: true });
      setTranslatedText(response.translatedText);
      setLastTranslatedText(response.text);
    } catch {
      console.warn('Efficient mode failed, falling back to non-efficient mode');
      try {
        const response = await getUpdatedTranslation(text, lastTranslatedText, translatedText, language, { efficientMode: false });
        setTranslatedText(response.translatedText);
        setLastTranslatedText(response.text);
      } catch (e) {
        console.error('Translation failed:', e);
      } 
    }
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
          <div className="whitespace-pre-line">{transcript}</div> :
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
              setLastTranslatedText("");
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
        <Remark>
          {translatedText}
        </Remark>
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
