import './App.css';
import { useState } from 'react';
import { useText, YDocProvider } from '@y-sweet/react';
import diff from 'fast-diff';

import { EditorProvider, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

// define your extension array
const extensions = [StarterKit]

const content = '<p>Hello World!</p>'

const Tiptap = ({onTextChanged}: {onTextChanged: (text: string) => void}) => {
  const onUpdate = ({ editor }: { editor: Editor }) => {
    onTextChanged(editor.getText())
  }
  return (
    <EditorProvider extensions={extensions} content={content} onUpdate={onUpdate}>
    </EditorProvider>
  )
}

// Hook based on implementation here https://discuss.yjs.dev/t/plain-text-input-component-with-y-text/2358/2
const useAsPlainText= (name: string) => {
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
  //const sharedSourceText = useText("sourceText");
  const [text, setText] = useAsPlainText("sourceText");
  const [translatedText, setTranslatedText] = useAsPlainText("translatedText");

  const doTranslation = async () => {
    try {
      const response = await fetch('/api/requestTranslation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          prevTranslatedText: translatedText,
          language: "Spanish"
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      setTranslatedText(result.translatedText);

    } catch (error) {
      console.error('Error during translation:', error);
    }
  }

  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full p-4">
        {<Tiptap onTextChanged={setText} />}
        <div className="flex justify-end mt-2">
          <button 
            className="bg-blue-600 text-white font-medium py-2 px-4 rounded hover:bg-blue-700 transition-colors"
            onClick={doTranslation}
          >
            Translate
          </button>
        </div>
      </div>
      <div className="w-1/2 h-full text-center text-2xl font-bold bg-sky-500 text-white p-2 flex items-center justify-center whitespace-pre">
        {translatedText}
      </div>
    </div>
  );
}

const App = () => {
  const docId = "example-doc";
  const authEndpoint = async () => {
    const response = await fetch('/api/ys-auth', {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, isEditor: true }),
    });
    return await response.json();
  }
  return (
    <YDocProvider docId={docId} authEndpoint={authEndpoint}>
      <AppInner />
    </YDocProvider>
  );
};

export default App;
