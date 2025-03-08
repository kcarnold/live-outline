import './App.css';
import { useState } from 'react';

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

function App() {
  const [text, setText] = useState("Hello world!");
  const [translatedText, setTranslatedText] = useState("");

  const doTranslation = async () => {
    try {
      const response = await fetch('/api/requestTranslation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
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

export default App;
