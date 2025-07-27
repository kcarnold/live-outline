import React from 'react';

export function useScrollToBottom(ref: React.RefObject<HTMLDivElement | null>, deps: React.DependencyList, enabled: boolean) {
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  React.useEffect(() => {
    if (timeoutRef.current || !enabledRef.current || !ref.current) {
      return;
    }
    timeoutRef.current = setTimeout(() => {
      if (!ref.current || !enabledRef.current) return;
      ref.current.scrollIntoView({
        behavior: "smooth",
      });
      timeoutRef.current = null;
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
