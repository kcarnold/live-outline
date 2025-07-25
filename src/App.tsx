import {
  AuthEndpoint,
  useConnectionStatus,
  useMap,
  useYDoc,
  YDocProvider,
} from "@y-sweet/react";
import React, { useRef, useState } from "react";
import "./App.css";


import { useAtom, useAtomValue } from "jotai";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { fontSizeAtom, isEditorAtom, languages } from "./configAtoms";
import { LayoutDiagram } from "./LayoutDiagram";
import { useScrollToBottom } from "./reactUtils";
import SpeechTranscriber from "./SpeechTranscriber";
import TranslatedTextViewer from "./TranslatedTextViewer";
import { translatedTextKeyForLanguage } from "./translationUtils";
import { ClientToken } from "@y-sweet/sdk";
import SlidesPlayer from "./SlidesPlayer";
import { SourceTextTranslationManager } from "./SourceTextTranslationManager";
import ProseMirrorEditor from "./ProseMirrorEditor";

function ConnectionStatusWidget({
  connectionStatus,
}: {
  connectionStatus: string;
}) {
  if (connectionStatus === "connected") {
    return null; // Don't show anything if connected
  }
  return (
    <div
      className={`px-1 py-1 rounded-full text-xs font-medium ${
        connectionStatus === "connecting"
          ? "bg-yellow-500 text-white"
          : "bg-red-500 text-white"
      }`}
    >
      {connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
    </div>
  );
}

function TranscriptViewer({ editable = false }: { editable?: boolean }) {
  const yDoc = useYDoc();
  const transcriptXml = yDoc.getXmlFragment("transcriptDoc");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  useScrollToBottom(transcriptEndRef, [transcriptText], true);

  return (
    <div className="p-compact">
      <ProseMirrorEditor
        yXmlFragment={transcriptXml}
        onTextChanged={setTranscriptText}
        editable={editable}
        onTranslationTrigger={() => null} // No-op, no translation in this viewer
        />
      <div ref={transcriptEndRef} className="h-0 w-0" />
    </div>
  );
}

// Layout components
function TranscriptComponent({ editable }: { editable: boolean }) {
  const cardClass = "rounded-md shadow bg-gray-100/80 dark:bg-gray-800/80 p-2 mb-2 flex flex-col gap-1 transition hover:shadow-lg";
  
  return (
    <div
      className={
        cardClass +
        " flex-1/2 overflow-auto bg-gray-50/80 dark:bg-gray-900/60 text-black dark:text-gray-200"
      }
    >
      {editable ? (
        <SpeechTranscriber />
      ) : (
        <h2 className="font-semibold text-xs text-gray-600 dark:text-gray-300 leading-tight">
          Transcript
        </h2>
      )}
      <TranscriptViewer editable={editable} />
    </div>
  );
}

function SourceTextComponent() {
  const cardClass = "rounded-md shadow bg-gray-100/80 dark:bg-gray-800/80 p-2 mb-2 flex flex-col gap-1 transition hover:shadow-lg";
  const ydoc = useYDoc();
  
  return (
    <div
      className={
        cardClass +
        " flex-1/2 overflow-auto bg-white/70 dark:bg-gray-900/70"
      }
    >
      <SourceTextTranslationManager ydoc={ydoc} />
    </div>
  );
}

function TranslatedOutlineComponent({ language, onLanguageChange }: { language: string; onLanguageChange: (newLang: string) => void }) {
  const cardClass = "rounded-md shadow bg-gray-100/80 dark:bg-gray-800/80 p-2 mb-2 flex flex-col gap-1 transition hover:shadow-lg";
  const fontSize = useAtomValue(fontSizeAtom);
  
  return (
    <div
      className={
        cardClass +
        " flex-1/2 bg-gray-100/80 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 overflow-auto"
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-semibold text-xs text-gray-500 dark:text-gray-300 leading-tight mb-0">
          Translation
        </h2>
        <select
          className="ml-2 px-1 py-0.5 rounded text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <TranslatedTextViewer
        yJsKey={translatedTextKeyForLanguage(language)}
        fontSize={fontSize}
      />
    </div>
  );
}

function VideoComponent({ isEditor }: { isEditor: boolean }) {
  const cardClass = "rounded-md shadow bg-gray-100/80 dark:bg-gray-800/80 p-2 mb-2 flex flex-col gap-1 transition hover:shadow-lg";
  const [peerConnectionDisconnected, setPeerConnectionDisconnected] = useState(true);
  const meta = useMap("meta");
  const videoVisibility = meta.get("videoVisibility") || "visible";

  if (!isEditor && videoVisibility === "hidden") {
    return null;
  }

  return (
    <div
      className={
        cardClass +
        " flex-1/2 overflow-hidden bg-gray-100/80 dark:bg-gray-900/60"
      }
    >
      {(isEditor || videoVisibility !== "hidden") && (
        <>
          {peerConnectionDisconnected && <b>Waiting for video...</b>}
          {isEditor && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              <label className="mr-1">
                <input
                  type="checkbox"
                  checked={videoVisibility !== "hidden"}
                  onChange={(e) => {
                    meta.set(
                      "videoVisibility",
                      e.target.checked ? "visible" : "hidden"
                    );
                  }}
                />{" "}
                Show Video
              </label>
            </div>
          )}
          <SlidesPlayer
            streamToken={"ncf-live-translation"}
            apiPath={"https://b.siobud.com/api"}
            setPeerConnectionDisconnected={setPeerConnectionDisconnected}
          />
        </>
      )}
    </div>
  );
}

// Layouts: each is an array of arrays of component keys
const availableLayouts = [
  {
    key: 'translation-only',
    label: 'Translation Only',
    layout: [
      ["video", "translatedOutline"]
    ]
  },
  {
    key: 'transcript-translation',
    label: 'Transcript | Translation',
    layout: [
      ["transcript"],
      ["translatedOutline", "video"]
    ]
  },
  {
    key: 'full',
    label: 'Transcript, Source | Translation',
    layout: [
      ["transcript", "sourceText"],
      ["translatedOutline", "video"]
    ]
  },
  {
    key: 'transcript-source',
    label: 'Transcript | Source Text, Translation',
    layout: [
      ["transcript", "video"],
      ["sourceText", "translatedOutline"]
    ]
  },
];


function HomePage() {
  const defaultLang = languages[0];
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-950 dark:to-gray-900 text-black dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-6 mt-8">
        Choose Language & Layout
      </h1>
      <div className="flex flex-col gap-6 w-full max-w-xl">
        {availableLayouts.map((layout) => {
          // Convert layout array to human-legible string, adding default language to translatedOutline components
          const layoutStr = layout.layout.map(row => 
            row.map(component => 
              component === 'translatedOutline' ? `translatedOutline-${defaultLang}` : component
            ).join(",")
          ).join("|");
          return (
            <div
              key={layout.key}
              className="bg-white/80 dark:bg-gray-800/80 rounded shadow p-4"
            >
              <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                <LayoutDiagram layout={layout.layout} />
                <Link
                  to={`/${layoutStr}`}
                  className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition text-sm"
                >
                  {layout.label}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Layout page: render the selected layout from URL
function LayoutPage() {
  const { layout } = useParams();
  const connectionStatus = useConnectionStatus();
  const ydoc = useYDoc();
  // @ts-expect-error ts doesn't like patching stuff onto window
  window.ydoc = ydoc; // For debugging purposes
  const isEditor = useAtomValue(isEditorAtom);
  const navigate = useNavigate();

  // Parse layout from URL: e.g. "transcript,translatedOutline-French|video" => [["transcript", "translatedOutline-French"], ["video"]]
  function parseLayoutString(layoutStr: string | undefined): string[][] {
    if (!layoutStr) return [];
    return layoutStr.split("|").map(row => row.split(","));
  }

  // Update URL when a translation component changes its language
  function updateComponentLanguage(oldComponentStr: string, newLanguage: string) {
    const parsedLayout = parseLayoutString(layout);
    const newLayoutStr = parsedLayout.map(row => 
      row.map(component => 
        component === oldComponentStr ? `translatedOutline-${newLanguage}` : component
      ).join(",")
    ).join("|");
    void navigate(`/${newLayoutStr}`, { replace: true });
  }

  // Function to render a component based on its string identifier
  const renderComponent = (componentStr: string, key: string) => {
    if (componentStr === 'transcript') {
      return <TranscriptComponent key={key} editable={isEditor} />;
    }
    
    if (componentStr === 'sourceText') {
      return <SourceTextComponent key={key} />;
    }
    
    if (componentStr === 'video') {
      return <VideoComponent key={key} isEditor={isEditor} />;
    }
    
    if (componentStr.startsWith('translatedOutline-')) {
      const language = componentStr.substring('translatedOutline-'.length);
      // Validate language, default to first language if invalid
      const validLanguage = (languages as readonly string[]).includes(language) ? language : languages[0];
      
      return (
        <TranslatedOutlineComponent 
          key={key}
          language={validLanguage}
          onLanguageChange={(newLang) => updateComponentLanguage(componentStr, newLang)}
        />
      );
    }
    
    // Invalid component
    return null;
  };

  const parsedLayout = parseLayoutString(layout);

  // Validate that all components in the layout are valid
  const isValidComponent = (componentStr: string): boolean => {
    if (['transcript', 'sourceText', 'video'].includes(componentStr)) {
      return true;
    }
    
    if (componentStr.startsWith('translatedOutline-')) {
      const language = componentStr.substring('translatedOutline-'.length);
      return (languages as readonly string[]).includes(language);
    }
    
    return false;
  };

  const isValidLayout = parsedLayout.every(
    (row) => row.every((key) => isValidComponent(key))
  );

  // If anything is wrong with the layout, redirect to home
  if (!isValidLayout) {
    void navigate("/", { replace: true });
    return null;
  }

  // Render layout columns
  const columns = parsedLayout.map((col, i) => {
    if (col.length === 0) return null;
    return (
      <div
        key={i}
        className={
          parsedLayout.length === 1
            ? "w-full h-full flex flex-col gap-2 p-2"
            : "flex flex-col w-full md:w-1/2 h-1/2 md:h-full gap-2 p-1"
        }
      >
        {col.map((componentStr, j) => 
          renderComponent(componentStr, `${componentStr}-${i}-${j}`)
        )}
      </div>
    );
  });

  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden relative touch-none bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-950 dark:to-gray-900">
      <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
        <ConnectionStatusWidget connectionStatus={connectionStatus} />
      </div>
      <Link
        to="/"
        className="fixed bottom-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-gray-500/70 text-white shadow-md hover:bg-gray-700/80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
        title="Home"
        style={{ fontSize: '1.3rem', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
      >
        <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🏠</span>
      </Link>
      {columns}
    </div>
  );
}

const App = () => {
  const docId = "doc14";
  // We're an editor only if location hash includes #editor
  const isEditor = window.location.hash.includes("editor");
  const [, setIsEditor] = useAtom(isEditorAtom);
  React.useEffect(() => {
    setIsEditor(isEditor);
  }, [isEditor, setIsEditor]);
  const authEndpoint: AuthEndpoint = async () => {
    const response = await fetch("/api/ys-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ docId, isEditor }),
    });
    return (await response.json()) as ClientToken;
  };

  return (
    <YDocProvider docId={docId} authEndpoint={authEndpoint}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:layout" element={<LayoutPage />} />
      </Routes>
    </YDocProvider>
  );
};

export default App;
