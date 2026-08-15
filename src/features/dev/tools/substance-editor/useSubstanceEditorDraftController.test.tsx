import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";

import { useSubstanceEditorDraftController } from "./useSubstanceEditorDraftController";
import type { SubstanceInfo } from "./types";

const article = {
  ...createEmptyArticle(),
  slug: "lsd",
  title: "LSD",
  identification: { ...createEmptyArticle().identification, common_name: "LSD" },
} as SubstanceArticle;

const substances: SubstanceInfo[] = [{ slug: "lsd", name: "LSD", reviewStatus: "needed" }];

function stubFormHandle(
  outcome: { valid: true } | { valid: false; errors: Record<string, { message: string }> },
): UseArticleFormReturn {
  return {
    methods: {
      handleSubmit:
        (
          onValid: (values: SubstanceArticle) => void,
          onInvalid?: (errors: unknown) => void,
        ) =>
        async () => {
          if (outcome.valid === true) {
            onValid(article);
            return;
          }
          onInvalid?.(outcome.errors);
        },
      getValues: () => article,
    },
  } as unknown as UseArticleFormReturn;
}

function setup() {
  const applyArticlesTransform = vi.fn();
  const view = renderHook(() =>
    useSubstanceEditorDraftController({
      articles: [article],
      applyArticlesTransform,
      selectedSubstanceSlug: "lsd",
      substances,
    }),
  );

  return { applyArticlesTransform, ...view };
}

describe("useSubstanceEditorDraftController apply gate", () => {
  it("blocks the apply and names the failing sections", async () => {
    const { result, applyArticlesTransform } = setup();
    await waitFor(() => expect(result.current.streamedOutput).not.toBe(""));

    act(() => {
      result.current.formRef.current = stubFormHandle({
        valid: false,
        errors: { dosage: { message: "Required" }, legality: { message: "Required" } },
      });
      result.current.handleFormMutate();
    });

    await act(async () => {
      await result.current.handleSaveToDatabase("draft");
    });

    expect(applyArticlesTransform).not.toHaveBeenCalled();
    expect(result.current.validationError).toBe(
      "Fix the highlighted fields in Dosage & Duration and Legality before applying this draft.",
    );
    expect(result.current.formDirty).toBe(true);
    expect(result.current.saveSuccess).toBe(false);
  });

  it("applies the draft and clears the dirty flag when the form validates", async () => {
    const { result, applyArticlesTransform } = setup();
    await waitFor(() => expect(result.current.streamedOutput).not.toBe(""));

    act(() => {
      result.current.formRef.current = stubFormHandle({ valid: true });
      result.current.handleFormMutate();
    });

    await act(async () => {
      await result.current.handleSaveToDatabase("draft");
    });

    expect(applyArticlesTransform).toHaveBeenCalledTimes(1);
    expect(result.current.validationError).toBeNull();
    expect(result.current.saveSuccess).toBe(true);
    expect(result.current.formDirty).toBe(false);
  });
});

describe("useSubstanceEditorDraftController hydration", () => {
  it("keeps a reconciled draft when only the substance list identity changes", async () => {
    const { result, rerender } = renderHook(
      ({ substanceList }: { substanceList: SubstanceInfo[] }) =>
        useSubstanceEditorDraftController({
          articles: [article],
          applyArticlesTransform: vi.fn(),
          selectedSubstanceSlug: "lsd",
          substances: substanceList,
        }),
      { initialProps: { substanceList: substances } },
    );
    await waitFor(() => expect(result.current.formArticleOverride).not.toBeNull());

    const reconciled = { ...article, title: "LSD (reconciled)" } as SubstanceArticle;
    act(() => {
      result.current.setFormArticleOverride(reconciled);
    });

    // A review tick rebuilds the picker entries without touching the articles.
    rerender({ substanceList: [{ slug: "lsd", name: "LSD", reviewStatus: "completed" }] });

    expect(result.current.formArticleOverride).toBe(reconciled);
  });

  it("re-hydrates when the article itself changes", async () => {
    const { result, rerender } = renderHook(
      ({ articleList }: { articleList: SubstanceArticle[] }) =>
        useSubstanceEditorDraftController({
          articles: articleList,
          applyArticlesTransform: vi.fn(),
          selectedSubstanceSlug: "lsd",
          substances,
        }),
      { initialProps: { articleList: [article] } },
    );
    await waitFor(() => expect(result.current.formArticleOverride).not.toBeNull());

    const nextArticle = { ...article, title: "LSD" } as SubstanceArticle;
    rerender({ articleList: [nextArticle] });

    await waitFor(() => expect(result.current.formArticleOverride).toBe(nextArticle));
  });

  it("keeps unapplied form edits when the working-set article changes underneath", async () => {
    const { result, rerender } = renderHook(
      ({ articleList }: { articleList: SubstanceArticle[] }) =>
        useSubstanceEditorDraftController({
          articles: articleList,
          applyArticlesTransform: vi.fn(),
          selectedSubstanceSlug: "lsd",
          substances,
        }),
      { initialProps: { articleList: [article] } },
    );
    await waitFor(() => expect(result.current.formArticleOverride).not.toBeNull());

    const typed = { ...article, title: "LSD (typed, not applied)" } as SubstanceArticle;
    act(() => {
      result.current.handleFormMutate();
      result.current.setFormArticleOverride(typed);
    });

    // A review tick overlays a fresh review record onto the same article, so
    // the working set hands the controller a new object. The unapplied edits
    // must survive it.
    const reviewed = {
      ...article,
      editorial_review: { ...article.editorial_review, status: "completed" as const },
    } as SubstanceArticle;
    rerender({ articleList: [reviewed] });

    expect(result.current.formArticleOverride).toBe(typed);
  });
});

describe("useSubstanceEditorDraftController clipboard", () => {
  it("reports a successful copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });

    const { result } = setup();
    await waitFor(() => expect(result.current.streamedOutput).not.toBe(""));

    act(() => {
      result.current.handleCopy();
    });

    await waitFor(() => expect(result.current.copyState).toBe("copied"));
  });

  it("reports a rejected clipboard write", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });

    const { result } = setup();
    await waitFor(() => expect(result.current.streamedOutput).not.toBe(""));

    act(() => {
      result.current.handleCopy();
    });

    await waitFor(() => expect(result.current.copyState).toBe("error"));
  });
});
