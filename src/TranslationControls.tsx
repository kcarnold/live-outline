import React from 'react';

interface TranslationControlsProps {
  translationError: string;
  isTranslating: boolean;
  onReset: () => void;
  onTranslate: () => void;
  disabled?: boolean;
}

const TranslationControls: React.FC<TranslationControlsProps> = ({
  translationError,
  isTranslating,
  onReset,
  onTranslate,
  disabled = false,
}) => (
  <div className="flex justify-end p-4 bg-white border-t">
    {translationError !== "" && (
      <div className="p-2 bg-red-800 text-white rounded-md mx-2">
        <b>Translation Error</b>: {translationError}
      </div>
    )}
    <button
      className="bg-gray-600 text-white font-medium py-2 px-4 rounded hover:bg-gray-700 transition-colors mr-2"
      onClick={onReset}
      disabled={disabled}
    >
      Reset
    </button>
    <button
      className={`text-white font-medium py-2 px-4 rounded transition-colors ${isTranslating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
      onClick={onTranslate}
      disabled={isTranslating || disabled}
    >
      {isTranslating ? 'Translating...' : 'Translate'}
    </button>
  </div>
);

export default TranslationControls;
