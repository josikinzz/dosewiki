import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import { parseGeneratedYaml } from "./yamlParser";
import {
  buildArticleYamlDraft,
  findExistingArticleForSubstance,
  upsertGeneratedArticle,
} from "./substanceEditorDraftUtils";
import {
  describeInvalidFields,
  describeInvalidSections,
  formatInvalidSectionsMessage,
  type InvalidArticleField,
} from "../../forms/articleFormSections";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";
import type { CopyState, OutputViewMode, SubstanceInfo } from "./types";

type UseSubstanceEditorDraftControllerArgs = {
  articles: SubstanceArticle[];
  applyArticlesTransform: (
    transform: (previous: SubstanceArticle[]) => SubstanceArticle[],
  ) => void;
  selectedSubstanceSlug: string | null;
  substances: SubstanceInfo[];
};

export function useSubstanceEditorDraftController({
  articles,
  applyArticlesTransform,
  selectedSubstanceSlug,
  substances,
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyResetRef = useRef<number | null>(null);
  const saveSuccessResetRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    if (saveSuccessResetRef.current !== null) window.clearTimeout(saveSuccessResetRef.current);
  }, []);

  const selectedSubstance = useMemo(
    () => substances.find((entry) => entry.slug === selectedSubstanceSlug) ?? null,
    [selectedSubstanceSlug, substances],
  );

  useEffect(() => {
    setFormDirty(false);
    setFormParseError(null);
    setFormArticleOverride(null);
    setValidationError(null);
    setStreamedOutput("");
  }, [selectedSubstanceSlug]);

  // Keyed on the resolved article rather than on the arrays it was resolved
  // from: `substances` is rebuilt whenever anything about the picker changes
  // (a review tick rewrites every entry's status), and re-hydrating on that
  // would throw away reconciliations the caller had just written into the
  // draft — silently reverting them on the next apply.
  const existingArticle = useMemo(
    () => findExistingArticleForSubstance(articles, substances, selectedSubstanceSlug),
    [articles, selectedSubstanceSlug, substances],
  );

  // A dirty form outranks a refreshed article. The working set now changes
  // under the review workbench for reasons that are not article content at all
  // — an inline field write, a reference append, a review tick — and each of
  // those used to reseed the form from the store, silently discarding whatever
  // the editor had typed and not yet applied.
  useEffect(() => {
    if (!existingArticle || formDirty) {
      return;
    }

    setStreamedOutput(buildArticleYamlDraft(existingArticle));
    setFormArticleOverride(existingArticle);
    setOutputViewMode("form");
  }, [existingArticle, formDirty]);

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
    void (async () => {
      try {
        await navigator.clipboard.writeText(streamedOutput);
        setCopyState("copied");
      } catch {
        setCopyState("error");
      }
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
      copyResetRef.current = window.setTimeout(() => setCopyState("idle"), 1600);
    })();
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
    async () => {
      if (!streamedOutput) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);
      setValidationError(null);
      setSaveSuccess(false);

      try {
        let article: SubstanceArticle;
        if (outputViewMode === "form" && formRef.current) {
          const { methods } = formRef.current;
          // `handleSubmit` is what runs the Zod resolver; the applied article
          // still comes from the raw values so the editor-only keys the schema
          // strips (slug above all) survive the round trip.
          const invalidResult = await new Promise<{
            fields: InvalidArticleField[];
            sections: string[];
          } | null>((resolve) => {
            void methods.handleSubmit(
              () => resolve(null),
              (errors) => {
                const fields = describeInvalidFields(errors);
                const firstInvalidPath = fields[0]?.path;
                if (firstInvalidPath) {
                  window.setTimeout(() => methods.setFocus(firstInvalidPath), 0);
                }
                resolve({
                  fields,
                  sections: describeInvalidSections(errors),
                });
              },
            )();
          });

          if (invalidResult) {
            setValidationError(
              formatInvalidSectionsMessage(invalidResult.sections, invalidResult.fields),
            );
            return;
          }

          article = methods.getValues();
        } else {
          const parseResult = parseGeneratedYaml(streamedOutput);
          if (!parseResult.success || !parseResult.data) {
            throw new Error(parseResult.error ?? "Failed to parse YAML");
          }
          article = parseResult.data;
        }

        applyArticlesTransform((previous) => upsertGeneratedArticle(previous, article).nextArticles);

        setFormDirty(false);
        setSaveSuccess(true);
        if (saveSuccessResetRef.current !== null) {
          window.clearTimeout(saveSuccessResetRef.current);
        }
        saveSuccessResetRef.current = window.setTimeout(() => setSaveSuccess(false), 3000);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    },
    [applyArticlesTransform, outputViewMode, streamedOutput],
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
    validationError,
    copyState,
    handleOutputViewModeChange,
    handleFormMutate,
    handleCopy,
    handleDownload,
    handleSaveToDatabase,
  };
}
