import React from 'react';
import { useConfig } from './ConfigContext';

interface ConfigPanelProps {
  onClose: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ onClose }) => {
  const { showOriginalText, setShowOriginalText, fontSize, setFontSize, showTranscript, setShowTranscript } = useConfig();

  return (
    <div className="absolute right-0 top-14 bg-white shadow-lg rounded-lg p-4 z-20 w-64 border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">Display Settings</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>
      
      <div className="mb-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOriginalText}
            onChange={(e) => {setShowOriginalText(e.target.checked)}}
            className="rounded"
          />
          <span>Show Original Text</span>
        </label>
      </div>
      
      <div className="mb-4">
        <label className="block mb-2">Font Size: {fontSize}px</label>
        <input
          type="range"
          min="12"
          max="24"
          value={fontSize}
          onChange={(e) => {setFontSize(parseInt(e.target.value))}}
          className="w-full"
        />
      </div>

      <div className="mb-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showTranscript}
            onChange={(e) => {setShowTranscript(e.target.checked)}}
            className="rounded"
          />
          <span>Show Transcript</span>
        </label>
      </div>
    </div>
  );
};

export default ConfigPanel;
