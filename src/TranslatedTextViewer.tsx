import React, { useRef } from 'react';
import { Remark } from 'react-remark';
import { useScrollToBottom } from './reactUtils';
import { useAsPlainText } from './yjsUtils';

interface TranslatedTextViewerProps {
  yJsKey: string;
  fontSize?: number;
}

const TranslatedTextViewer: React.FC<TranslatedTextViewerProps> = ({ yJsKey, fontSize }) => {
  const [translatedText] = useAsPlainText(yJsKey);
  const translatedTextEndRef = useRef<HTMLDivElement | null>(null);
  useScrollToBottom(translatedTextEndRef, [translatedText]);
  return (
    <div className="overflow-auto pb-16" style={fontSize ? { fontSize: `${fontSize}px` } : undefined}>
      <Remark>
        {translatedText}
      </Remark>
      <div ref={translatedTextEndRef} />
    </div>
  );
};

export default TranslatedTextViewer;
