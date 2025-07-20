import React, { useRef, useEffect, useMemo } from 'react';
import * as production from 'react/jsx-runtime'; // Required by rehype-react
import { useScrollToBottom } from './reactUtils';
import { useAsPlainText } from './yjsUtils';
import { remarkEmphasizeNewNodes } from './remarkEmphasizeNewNodes';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeReact from 'rehype-react';


interface TranslatedTextViewerProps {
  yJsKey: string;
  fontSize?: number;
}


const TranslatedTextViewer: React.FC<TranslatedTextViewerProps> = ({ yJsKey, fontSize }) => {
  const [translatedText] = useAsPlainText(yJsKey);
  // Use a ref to avoid infinite update loop
  const prevTextHashesRef = useRef<Set<string>>(new Set());
  const translatedTextEndRef = useRef<HTMLDivElement | null>(null);

  useScrollToBottom(translatedTextEndRef, [translatedText]);

  // Only process once: update prevTextHashes after renderedTree is created
  const renderedTree = useMemo(() => {
    const currentTextHashes = new Set<string>();
    if (translatedText.length === 0) {
      return { tree: <div className="text-gray-500 italic">No translated text available</div>, currentTextHashes };
    }
    const tree = unified()
      .use(remarkParse)
      .use(remarkEmphasizeNewNodes, { prevTextHashes: prevTextHashesRef.current, currentTextHashes })
      .use(remarkRehype)
      .use(rehypeReact, production)
      .processSync(translatedText).result as React.ReactNode;
    return { tree, currentTextHashes };
  }, [translatedText]);

  useEffect(() => {
    prevTextHashesRef.current = renderedTree.currentTextHashes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedTree]);


  return (
    <div
      className={`overflow-auto pb-16 max-w-2xl w-full mx-auto`}
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {renderedTree.tree}
      <div ref={translatedTextEndRef} />
    </div>
  );
};

export default TranslatedTextViewer;
