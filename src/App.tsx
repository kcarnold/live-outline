import './App.css';
import { useState } from 'react';

function App() {
  const [text, setText] = useState("Hello world!");

  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full p-4">
        <textarea
          className="w-full h-full border-2 border-gray-300 p-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="w-1/2 h-full text-center text-2xl font-bold bg-sky-500 text-white p-4 flex items-center justify-center">
        {text}
      </div>
    </div>
  );
}

export default App;
