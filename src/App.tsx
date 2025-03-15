import './App.css';
import { useState, useRef, useEffect } from 'react';
import { useMap, useText, useYDoc, YDocProvider } from '@y-sweet/react';
import diff from 'fast-diff';
import * as Y from 'yjs';

// ProseMirror imports
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { exampleSetup } from 'prosemirror-example-setup';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror';
import { keymap } from 'prosemirror-keymap';

// For markdown conversion
import { Remark } from 'react-remark';
import { schema, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { Awareness } from 'y-protocols/awareness.js';

// ProseMirror component to replace Tiptap
const ProseMirrorEditor = ({ yDoc, onTextChanged, editable }: {yDoc: Y.Doc, onTextChanged: (text: string) => void, editable: boolean}) => {
  const editorRef = useRef<null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Get the shared type from the Yjs document
    const yXmlFragment = yDoc.getXmlFragment('prosemirror');

    // Create ProseMirror state with Yjs sync plugin
    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        //yCursorPlugin(yDoc.getMap('cursors')),
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo
        }),
        ...exampleSetup({ schema })
      ]
    });

    // Create ProseMirror view
    console.log('Creating ProseMirror view');
    let view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        
        // Convert content to markdown when it changes
        if (transaction.docChanged && onTextChanged) {
          const serializedContent = defaultMarkdownSerializer.serialize(newState.doc);
          onTextChanged(serializedContent);
        }
      },
      editable: () => editable
    });

    // Store the view in a ref
    viewRef.current = view;

    // Cleanup
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
      }
    };
  }, [yDoc, onTextChanged, editable]);

  return <div ref={editorRef} className="prose max-w-none" />;
};

// Hook based on implementation here https://discuss.yjs.dev/t/plain-text-input-component-with-y-text/2358/2

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
    const delta = diffToDelta(diff(text, newText));
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

function AppInner() {
  const ydoc = useYDoc();
  const [text, setText] = useState("");
  const [translatedText, setTranslatedText] = useAsPlainText("translatedText");
  const sharedMeta = useMap("meta");
  const language = sharedMeta.get("language") as string || "Spanish";
  const setLanguage = (newLanguage: string) => {
    sharedMeta.set("language", newLanguage);
  };
  const [isTranslating, setIsTranslating] = useState(false);

  const doTranslation = async () => {
    if (isTranslating) return;
    
    setIsTranslating(true);
    try {
      const response = await fetch('/api/requestTranslation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          prevTranslatedText: translatedText,
          language
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setTranslatedText(result.translatedText);

    } catch (error) {
      console.error('Error during translation:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="flex h-dvh">
      <div className="flex flex-col w-1/2 h-full">
        <div className="flex-grow overflow-auto p-4">
          <ProseMirrorEditor yDoc={ydoc} onTextChanged={setText} editable={true} />
        </div>
        <div className="flex justify-end p-4 bg-white border-t sticky bottom-0">
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
        </div>
      </div>
      <div className="w-full md:w-1/2 h-1/2 md:h-full bg-sky-500 text-white p-2 overflow-auto">
        <Remark>
          {translatedText}
        </Remark>
      </div>
    </div>
  );
}

const ViewOnly = () => {
  const ydoc = useYDoc();
  const translatedText = useText("translatedText");
  
  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden">
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 overflow-auto">
        <div className="p-4">
          <ProseMirrorEditor yDoc={ydoc} editable={false} onTextChanged={() => null} />
        </div>
      </div>
      <div className="w-full md:w-1/2 h-1/2 md:h-full bg-sky-500 text-white p-2 overflow-auto pb-16">
        <Remark>
          {translatedText.toString()}
        </Remark>
      </div>
    </div>
  );
};

const App = () => {
  const docId = "example-doc";
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
      {isEditor ? <AppInner /> : <ViewOnly />}
    </YDocProvider>
  );
};

export default App;