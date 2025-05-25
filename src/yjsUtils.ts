import { useEffect, useState } from 'react';
import diff from 'fast-diff';
import { useText } from '@y-sweet/react';
import * as Y from 'yjs';

// Hook based on implementation here https://discuss.yjs.dev/t/plain-text-input-component-with-y-text/2358/2
export const useAsPlainText = (name: string): [string, (newText: string) => void] => {
  const sharedText = useText(name);
  const [text, setText] = useState(sharedText.toString());
  
  useEffect(() => {
    const observer = () => {
      setText(sharedText.toString());
    };
    
    sharedText.observe(observer);
    return () => { sharedText.unobserve(observer); };
  }, [sharedText]);

  const setPlainText = (newText: string) => {
    setYTextFromString(sharedText, newText);
    // Don't set the state here, as it will be set by the observer
  };
  
  return [text, setPlainText];
};

export const usePlainTextSetter = (name: string): ((newText: string) => void) => {
  const sharedText = useText(name);
  const setPlainText = (newText: string) => {
    setYTextFromString(sharedText, newText);
  };
  return setPlainText;
};


export function setYTextFromString(yText: Y.Text, text: string) {
  const currentText = yText.toString();
  const delta = diffToDelta(diff(currentText, text));
  yText.applyDelta(delta);
}

function diffToDelta(diffResult: diff.Diff[]): any[] {
  return diffResult.map(([op, value]) => {
    if (op === diff.INSERT) 
      return { insert: value };
    if (op === diff.DELETE)
      return { delete: value.length };
    if (op === diff.EQUAL)
      return { retain: value.length };
    console.error('Unknown diff operation:', op);
    return null;
  });
}
