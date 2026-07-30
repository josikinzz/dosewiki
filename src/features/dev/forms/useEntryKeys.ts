import { useCallback, useId, useRef, useState } from "react";

/**
 * Row keys for the plain-array entry editors that cannot use `useFieldArray`'s
 * `field.id`. Index keys reuse DOM and local control state for the wrong row
 * when a middle entry is removed, so each row carries an identity that survives
 * removal. A length change that did not come through `appendKey`/`removeKey`
 * (article load/reset) re-keys the whole list.
 */
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
