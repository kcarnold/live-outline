
import React, { useRef } from 'react';
import { Remark } from 'react-remark';
import { useScrollToBottom } from './reactUtils';
import { useAsPlainText } from './yjsUtils';

interface TranslatedTextViewerProps {
  yJsKey: string;
}

const TranslatedTextViewer: React.FC<TranslatedTextViewerProps> = ({ yJsKey }) => {
  const [translatedText] = useAsPlainText(yJsKey);
  const translatedTextEndRef = useRef<HTMLDivElement | null>(null);
  useScrollToBottom(translatedTextEndRef, [translatedText]);
  return (
    <div>
      <Remark>
        {translatedText}
      </Remark>
      <div ref={translatedTextEndRef} />
    </div>
  );
};

export default TranslatedTextViewer;
