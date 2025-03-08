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

  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full p-4">
        {<Tiptap onTextChanged={setText} />}
        <div className="flex justify-end mt-2">
          <button 
            className="bg-blue-600 text-white font-medium py-2 px-4 rounded hover:bg-blue-700 transition-colors"
            onClick={() => {
              console.log('Translate button clicked');
            }}
          >
            Translate
          </button>
        </div>
      </div>
      <div className="w-1/2 h-full text-center text-2xl font-bold bg-sky-500 text-white p-2 flex items-center justify-center whitespace-pre">
        {text}
      </div>
    </div>
  );
}

export default App;
