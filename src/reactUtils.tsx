import React from 'react';

export function useScrollToBottom(ref: React.RefObject<HTMLDivElement | null>, deps: React.DependencyList) {
  React.useEffect(() => {
    setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
