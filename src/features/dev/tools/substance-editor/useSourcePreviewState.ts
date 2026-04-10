import { useCallback, useMemo, useState } from "react";
import type { SourceInfo } from "@/hooks/useArticleSources";

export function useSourcePreviewState(
  availableSources: SourceInfo[],
  getSourceContent: (sourceId: string) => string | null,
) {
  const [fullscreenSourceId, setFullscreenSourceId] = useState<string | null>(null);

  const openSourcePreview = useCallback((sourceId: string) => {
    setFullscreenSourceId(sourceId);
  }, []);

  const closeSourcePreview = useCallback(() => {
    setFullscreenSourceId(null);
  }, []);

  const fullscreenSource = useMemo(
    () => (fullscreenSourceId ? availableSources.find((source) => source.id === fullscreenSourceId) : undefined),
    [availableSources, fullscreenSourceId],
  );

  const fullscreenSourceContent = useMemo(
    () => (fullscreenSource ? getSourceContent(fullscreenSource.id) : null),
    [fullscreenSource, getSourceContent],
  );

  return {
    fullscreenSourceId,
    setFullscreenSourceId,
    fullscreenSource,
    fullscreenSourceContent,
    openSourcePreview,
    closeSourcePreview,
  };
}
