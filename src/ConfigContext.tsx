import { useAtom } from 'jotai';
import { showOriginalTextAtom, fontSizeAtom, showTranscriptAtom } from './configAtoms';

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // No-op provider for compatibility
  return <>{children}</>;
};

export const useConfig = () => {
  const [showOriginalText, setShowOriginalText] = useAtom(showOriginalTextAtom);
  const [fontSize, setFontSize] = useAtom(fontSizeAtom);
  const [showTranscript, setShowTranscript] = useAtom(showTranscriptAtom);
  return {
    showOriginalText,
    setShowOriginalText,
    fontSize,
    setFontSize,
    showTranscript,
    setShowTranscript,
  };
};
