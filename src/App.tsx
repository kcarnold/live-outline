import './App.css';
import { useState } from 'react';
import { useText, useYDoc, YDocProvider } from '@y-sweet/react';
import diff from 'fast-diff';

import { EditorProvider, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { Markdown } from 'tiptap-markdown';
import * as Y from 'yjs';

import { Remark } from 'react-remark';

const content = '<p>Hello World!</p>'

const Tiptap = ({yDoc, onTextChanged, editable}: {yDoc: Y.Doc, onTextChanged: (text: string) => void, editable: boolean}) => {
  const onUpdate = ({ editor }: { editor: Editor }) => {
    const markdown = editor.storage.markdown.getMarkdown()
    onTextChanged(markdown);
  }
  return (
    <EditorProvider extensions={
      [
        StarterKit.configure({
          history: false // use yjs instead of tiptap history
        }),
        Markdown,
        Collaboration.configure({
          document: yDoc
        })
      ]
    } content={content} onUpdate={onUpdate} editable={editable}>
    </EditorProvider>
  )
}

// Hook based on implementation here https://discuss.yjs.dev/t/plain-text-input-component-with-y-text/2358/2
const useAsPlainText = (name: string): [string, (newText: string) => void] => {
  const sharedText = useText(name);
  const [text, setText] = useState(sharedText.toString());
  sharedText.observe(() => {
    setText(sharedText.toString());
  });
  const setPlainText = (newText: string) => {
    const delta = diffToDelta(diff(text, newText));
    sharedText.applyDelta(delta);
  };
  return [text, setPlainText];
}

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
  const [language, setLanguage] = useState("Spanish");
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
  }

  return (
    <div className="flex h-dvh">
      <div className="flex flex-col w-1/2 h-full">
        <div className="flex-grow overflow-auto p-4">
          {<Tiptap yDoc={ydoc} onTextChanged={setText} editable={true} />}
        </div>
        <div className="flex justify-end p-4 bg-white border-t sticky bottom-0">
          {/* Language selector */ }
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
          <Tiptap yDoc={ydoc} editable={false} onTextChanged={() => null} />
        </div>
      </div>
      <div className="w-full md:w-1/2 h-1/2 md:h-full bg-sky-500 text-white p-2 overflow-auto pb-16">
        <Remark>
          {translatedText.toString()}
        </Remark>
      </div>
    </div>
  );
}

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
  }
  return (
    <YDocProvider docId={docId} authEndpoint={authEndpoint}>
      {isEditor ? <AppInner /> : <ViewOnly />}
    </YDocProvider>
  );
};

export default App;