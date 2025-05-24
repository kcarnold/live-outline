import { useEffect, useState } from 'react';
import diff from 'fast-diff';
import { useText } from '@y-sweet/react';


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
    // Get the current text value directly from sharedText instead of using potentially stale state
    const currentText = sharedText.toString();
    const delta = diffToDelta(diff(currentText, newText));
    sharedText.applyDelta(delta);
  };
  
  return [text, setPlainText];
};

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
