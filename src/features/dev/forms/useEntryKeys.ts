import { useCallback, useId, useRef, useState } from "react";

export function useEntryKeys(count: number) {
  const prefix = useId();
  const nextIdRef = useRef(0);
  const mintKeys = useCallback(
    (length: number) =>
      Array.from({ length }, () => `${prefix}-entry-${nextIdRef.current++}`),
    [prefix],
  );
  const [keys, setKeys] = useState<string[]>(() => mintKeys(count));

  if (keys.length !== count) {
    setKeys(mintKeys(count));
  }

  const appendKey = useCallback(() => {
    setKeys((current) => [...current, ...mintKeys(1)]);
  }, [mintKeys]);

  const removeKey = useCallback((index: number) => {
    setKeys((current) => current.filter((_, keyIndex) => keyIndex !== index));
  }, []);

  return { keys, appendKey, removeKey };
}
