import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ConfigContextType {
  showOriginalText: boolean;
  setShowOriginalText: (show: boolean) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  showTranscript: boolean;
  setShowTranscript: (show: boolean) => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showOriginalText, setShowOriginalText] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [showTranscript, setShowTranscript] = useState(true);

  return (
    <ConfigContext.Provider value={{
      showOriginalText,
      setShowOriginalText,
      fontSize,
      setFontSize,
      showTranscript,
      setShowTranscript
    }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
