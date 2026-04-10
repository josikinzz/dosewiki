import { useCallback, useRef, useState } from "react";

export function useDevPromptState(initialPrompt: string) {
  const originalGeneratorPromptRef = useRef(initialPrompt);
  const [generatorPrompt, setGeneratorPrompt] = useState(() => initialPrompt);

  const replaceGeneratorPrompt = useCallback((nextPrompt: string) => {
    setGeneratorPrompt(nextPrompt);
  }, []);

  const resetGeneratorPrompt = useCallback(() => {
    setGeneratorPrompt(originalGeneratorPromptRef.current);
  }, []);

  const getOriginalGeneratorPrompt = useCallback(() => originalGeneratorPromptRef.current, []);

  return {
    generatorPrompt,
    getOriginalGeneratorPrompt,
    replaceGeneratorPrompt,
    resetGeneratorPrompt,
  };
}
