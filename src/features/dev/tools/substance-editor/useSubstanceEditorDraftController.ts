import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import { parseGeneratedYaml } from "./yamlParser";
import {
  buildArticleYamlDraft,
  findExistingArticleForSubstance,
  upsertGeneratedArticle,
} from "./substanceEditorDraftUtils";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";
import type { OutputViewMode, SubstanceInfo } from "./types";

type UseSubstanceEditorDraftControllerArgs = {
  articles: SubstanceArticle[];
  applyArticlesTransform: (
    transform: (previous: SubstanceArticle[]) => SubstanceArticle[],
  ) => void;
  selectedSubstanceSlug: string | null;
  substances: SubstanceInfo[];
  commitPanel?: React.ReactNode;
};

export function useSubstanceEditorDraftController({
  articles,
  applyArticlesTransform,
  selectedSubstanceSlug,
  substances,
  commitPanel,
}: UseSubstanceEditorDraftControllerArgs) {
  const [streamedOutput, setStreamedOutput] = useState("");
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>("yaml");
  const formRef = useRef<UseArticleFormReturn | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [formParseError, setFormParseError] = useState<string | null>(null);
  const [formArticleOverride, setFormArticleOverride] = useState<SubstanceArticle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedSubstance = useMemo(
    () => substances.find((entry) => entry.slug === selectedSubstanceSlug) ?? null,
    [selectedSubstanceSlug, substances],
  );

  useEffect(() => {
    setFormDirty(false);
    setFormParseError(null);
    setFormArticleOverride(null);
    formRef.current = null;
    setStreamedOutput("");
  }, [selectedSubstanceSlug]);

  useEffect(() => {
    const existingArticle = findExistingArticleForSubstance(
      articles,
      substances,
      selectedSubstanceSlug,
    );
    if (!existingArticle) {
      return;
    }

    setStreamedOutput(buildArticleYamlDraft(existingArticle));
    setFormArticleOverride(existingArticle);
    setOutputViewMode("form");
  }, [articles, selectedSubstanceSlug, substances]);

  const handleOutputViewModeChange = useCallback(
    (mode: OutputViewMode) => {
      if (outputViewMode === "form" && formDirty && formRef.current) {
        const values = formRef.current.methods.getValues();
        const yamlOutput = yaml.stringify(values, { lineWidth: 0, nullStr: "" });
        setStreamedOutput(yamlOutput);
        setFormArticleOverride(values);
        setFormDirty(false);
      }

      if (mode === "form") {
        const parseResult = parseGeneratedYaml(streamedOutput);
        if (parseResult.success && parseResult.data) {
          setFormParseError(null);
          setFormArticleOverride(parseResult.data);
        } else {
          setFormParseError(parseResult.error ?? "Failed to parse YAML");
          setFormArticleOverride(null);
        }
      }

      setOutputViewMode(mode);
    },
    [formDirty, outputViewMode, streamedOutput],
  );

  const handleFormMutate = useCallback(() => {
    setFormDirty(true);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(streamedOutput);
  }, [streamedOutput]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([streamedOutput], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedSubstance?.name ?? "article"}.yaml`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedSubstance?.name, streamedOutput]);

  const handleSaveToDatabase = useCallback(
    (mode: "draft" | "publish" = "draft") => {
      if (!streamedOutput) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      try {
        let article: SubstanceArticle;
        if (outputViewMode === "form" && formRef.current) {
          article = formRef.current.methods.getValues();
        } else {
          const parseResult = parseGeneratedYaml(streamedOutput);
          if (!parseResult.success || !parseResult.data) {
            throw new Error(parseResult.error ?? "Failed to parse YAML");
          }
          article = parseResult.data;
        }

        applyArticlesTransform((previous) => upsertGeneratedArticle(previous, article).nextArticles);

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);

        if (mode === "publish" && commitPanel) {
          // The commit panel is already visible in the parent shell.
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    },
    [applyArticlesTransform, commitPanel, outputViewMode, streamedOutput],
  );

  return {
    streamedOutput,
    setStreamedOutput,
    outputViewMode,
    formRef,
    formDirty,
    formParseError,
    formArticleOverride,
    setFormArticleOverride,
    isSaving,
    saveSuccess,
    saveError,
    handleOutputViewModeChange,
    handleFormMutate,
    handleCopy,
    handleDownload,
    handleSaveToDatabase,
  };
}
