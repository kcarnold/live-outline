
import React from 'react';
import { useAtom } from 'jotai';
import { showOriginalTextAtom, fontSizeAtom, showTranscriptAtom, languageAtom } from './configAtoms';
import CheckboxForAtom from './CheckboxForAtom';

interface ConfigPanelProps {
  onClose: () => void;
}


const ConfigPanel: React.FC<ConfigPanelProps> = ({ onClose }) => {
  const [fontSize, setFontSize] = useAtom(fontSizeAtom);
  const [language, setLanguage] = useAtom(languageAtom);

  return (
    <div className="absolute right-0 top-14 bg-white shadow-lg rounded-lg p-4 z-20 w-64 border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">Display Settings</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      <div className="mb-4">
        <CheckboxForAtom atom={showOriginalTextAtom} label="Show Original Text" />
      </div>

      <div className="mb-4">
        <CheckboxForAtom atom={showTranscriptAtom} label="Show Transcript" />
      </div>

      <div className="mb-4">
        <label className="block mb-2">Font Size: {fontSize}px</label>
        <input
          type="range"
          min="12"
          max="64"
          value={fontSize}
          onChange={(e) => {setFontSize(parseInt(e.target.value))}}
          className="w-full"
        />
      </div>

      <div className="mb-4">
        <label className="block mb-2">Translation Language</label>
        <select
          className="bg-white text-black font-medium py-2 px-4 rounded w-full"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="Spanish">Spanish</option>
          <option value="French">French</option>
          <option value="Haitian Creole">Haitian Creole</option>
        </select>
      </div>
    </div>
  );
};

export default ConfigPanel;
