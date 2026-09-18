import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import { createEmptyDosageRoute, createEmptyDurationRoute } from "@/data/schema/defaultFactories";
import type { SubstanceArticle } from "@/schema";
import { pairRoutesByName, useArticleForm, type UseArticleFormReturn } from "./useArticleForm";

function createArticle(): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    title: "LSD",
    references: [
      {
        id: "ref-1",
        type: "webpage",
        title: "Reference One",
        authors: [],
        url: "https://example.test/ref-1",
        sourceType: "unknown",
        quality: "fallback",
      },
    ],
    dosage: {
      routes: [
        {
          route: "Oral",
          bioavailability: "75%",
          bioavailability_notes: "",
          dose_ranges: {
            threshold: { min: null, max: null, unit: "mg" },
            light: { min: 5, max: 10, unit: "mg" },
            moderate: { min: 10, max: 20, unit: "mg" },
            strong: { min: 20, max: 30, unit: "mg" },
            heavy: { min: 30, max: null, unit: "mg" },
          },
          notes: "",
          reference_ids: ["ref-1"],
        },
      ],
      plateau_dosing: null,
    },
    duration: {
      routes: [
        {
          route: "Oral",
          half_life: "4 hours",
          half_life_notes: "",
          stages: {
            onset: { min: 15, max: 30, unit: "minutes" },
            come_up: { min: 30, max: 60, unit: "minutes" },
            peak: { min: 2, max: 4, unit: "hours" },
            offset: { min: 1, max: 2, unit: "hours" },
            after_effects: { min: 2, max: 4, unit: "hours" },
            total_duration: { min: 4, max: 8, unit: "hours" },
          },
          reference_ids: ["ref-1"],
        },
      ],
    },
  };
}

function createTwoRouteArticle(): SubstanceArticle {
  const base = createArticle();
  return {
    ...base,
    dosage: {
      ...base.dosage,
      routes: [
        base.dosage.routes[0],
        {
          ...base.dosage.routes[0],
          route: "Smoked",
          bioavailability: "20%",
          reference_ids: ["ref-2"],
        },
      ],
    },
    duration: {
      routes: [
        base.duration.routes[0],
        {
          ...base.duration.routes[0],
          route: "Smoked",
          half_life: "30 minutes",
          stages: {
            onset: { min: 0, max: 1, unit: "minutes" },
            come_up: { min: 1, max: 2, unit: "minutes" },
            peak: { min: 5, max: 10, unit: "minutes" },
            offset: { min: 10, max: 20, unit: "minutes" },
            after_effects: { min: 20, max: 40, unit: "minutes" },
            total_duration: { min: 30, max: 60, unit: "minutes" },
          },
          reference_ids: ["ref-2"],
        },
      ],
    },
  };
}

function UseArticleFormHarness({
  article,
  onMutate,
  onReady,
}: {
  article: SubstanceArticle;
  onMutate?: () => void;
  onReady: (form: UseArticleFormReturn) => void;
}) {
  const form = useArticleForm({ article, onMutate });

  useEffect(() => {
    onReady(form);
  }, [form, onReady]);

  return null;
}

describe("useArticleForm", () => {
  it("preserves references and route reference_ids while syncing duration routes", async () => {
    const article = createArticle();
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    expect(latestForm?.methods.getValues().references).toEqual(article.references);
    expect(latestForm?.methods.getValues("dosage.routes.0.reference_ids")).toEqual(["ref-1"]);
    expect(latestForm?.methods.getValues("duration.routes.0.reference_ids")).toEqual(["ref-1"]);

    act(() => {
      latestForm?.renameDosageRoute(0, "Sublingual");
    });

    await waitFor(() => {
      expect(latestForm?.methods.getValues("duration.routes.0.route")).toBe("Sublingual");
    });

    expect(latestForm?.methods.getValues().references).toEqual(article.references);
    expect(latestForm?.methods.getValues("dosage.routes.0.reference_ids")).toEqual(["ref-1"]);
    expect(latestForm?.methods.getValues("duration.routes.0.reference_ids")).toEqual(["ref-1"]);
  });

  it("moves dosage and duration routes together without relabeling their data", async () => {
    const article = createTwoRouteArticle();
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    act(() => {
      latestForm?.moveDosageRoute(1, 0);
    });

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("dosage.routes").map((route) => route.route),
      ).toEqual(["Smoked", "Oral"]);
    });

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("duration.routes").map((route) => route.route),
      ).toEqual(["Smoked", "Oral"]);
    });

    expect(latestForm?.methods.getValues("duration.routes.0.half_life")).toBe("30 minutes");
    expect(latestForm?.methods.getValues("duration.routes.1.half_life")).toBe("4 hours");
    expect(latestForm?.methods.getValues("duration.routes.0.stages")).toEqual(
      article.duration.routes[1].stages,
    );
    expect(latestForm?.methods.getValues("duration.routes.1.stages")).toEqual(
      article.duration.routes[0].stages,
    );
    expect(latestForm?.methods.getValues("duration.routes.0.reference_ids")).toEqual(["ref-2"]);
    expect(latestForm?.methods.getValues("duration.routes.1.reference_ids")).toEqual(["ref-1"]);
    expect(latestForm?.methods.getValues("dosage.routes.0.bioavailability")).toBe("20%");
    expect(latestForm?.methods.getValues("dosage.routes.1.bioavailability")).toBe("75%");
  });

  /**
   * The review workbench's tick is not an edit. It writes the stored
   * `editorial_review` back into the mounted form so the editor view agrees
   * with the bar, and `substanceIndex.setEditorialReview` stamps a fresh
   * `reviewed_at` every time — so the written value *always* differs from what
   * the form held. Reported as a mutation, that flips the workbench's
   * `formDirty` and every subsequent article change is met with a
   * "discard unapplied edits?" confirm the reviewer never earned.
   */
  describe("mutation reporting", () => {
    async function mountWithMutationSpy(article: SubstanceArticle) {
      const onMutate = vi.fn();
      let latestForm: UseArticleFormReturn | null = null;

      render(
        <UseArticleFormHarness
          article={article}
          onMutate={onMutate}
          onReady={(form) => {
            latestForm = form;
          }}
        />,
      );

      await waitFor(() => {
        expect(latestForm).not.toBeNull();
      });
      // The mount-time hydration is a programmatic write and must already be
      // silent, or the assertions below would be measuring it.
      expect(onMutate).not.toHaveBeenCalled();

      return { form: latestForm as unknown as UseArticleFormReturn, onMutate };
    }

    const completedReview = {
      status: "completed" as const,
      notes: "",
      reviewed_by: "reviewer@example.test",
      reviewed_at: "2026-07-31T12:00:00.000Z",
    };

    it("reports a real edit", async () => {
      const { form, onMutate } = await mountWithMutationSpy(createArticle());

      act(() => {
        form.methods.setValue("title", "LSD-25");
      });

      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });
    });

    it("stays silent when a review tick writes back through resetForm", async () => {
      const article = createArticle();
      const { form, onMutate } = await mountWithMutationSpy(article);

      act(() => {
        form.resetForm({ ...article, editorial_review: completedReview });
      });

      await waitFor(() => {
        expect(form.methods.getValues("editorial_review")).toEqual(completedReview);
      });
      // Two flushes' worth of trailing field-array notifications, all suppressed.
      await act(async () => {
        await Promise.resolve();
      });
      expect(onMutate).not.toHaveBeenCalled();
    });

    it("keeps unapplied edits when a review tick is merged into live values", async () => {
      const article = createArticle();
      const { form, onMutate } = await mountWithMutationSpy(article);

      act(() => {
        form.methods.setValue("summary", "A reviewer's unapplied sentence.");
      });
      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });
      onMutate.mockClear();

      // The workbench merges the stored review into `getValues()`, never into
      // the last applied article, so the in-flight edit survives the tick.
      act(() => {
        const live = form.methods.getValues();
        form.resetForm({ ...live, editorial_review: completedReview });
      });

      await waitFor(() => {
        expect(form.methods.getValues("editorial_review")).toEqual(completedReview);
      });
      expect(form.methods.getValues("summary")).toBe("A reviewer's unapplied sentence.");
      expect(onMutate).not.toHaveBeenCalled();
    });

    it("still reports a bare setValue, which is why the tick cannot use one", async () => {
      const { form, onMutate } = await mountWithMutationSpy(createArticle());

      act(() => {
        form.methods.setValue("editorial_review", completedReview);
      });

      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });
    });
  });

  it("ignores out-of-range route moves", async () => {
    const article = createTwoRouteArticle();
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    act(() => {
      latestForm?.moveDosageRoute(0, 2);
      latestForm?.moveDosageRoute(-1, 0);
      latestForm?.moveDosageRoute(1, 1);
    });

    expect(
      latestForm?.methods.getValues("dosage.routes").map((route) => route.route),
    ).toEqual(["Oral", "Smoked"]);
    expect(
      latestForm?.methods.getValues("duration.routes").map((route) => route.route),
    ).toEqual(["Oral", "Smoked"]);
  });
});

describe("pairRoutesByName", () => {
  it("pairs same-length routes by name instead of relabeling by index", () => {
    const dosage = [createEmptyDosageRoute("Oral"), createEmptyDosageRoute("Smoked")];
    const duration = [
      createEmptyDurationRoute("Smoked", { half_life: "30 minutes" }),
      createEmptyDurationRoute("Oral", { half_life: "4 hours" }),
    ];

    const paired = pairRoutesByName(dosage, duration);

    expect(paired.dosage.map((route) => route.route)).toEqual(["Oral", "Smoked"]);
    expect(paired.duration.map((route) => route.route)).toEqual(["Oral", "Smoked"]);
    // The timings must follow their own route, not the position they sat in.
    expect(paired.duration[0].half_life).toBe("4 hours");
    expect(paired.duration[1].half_life).toBe("30 minutes");
  });

  it("exposes a duration route that has no dosage counterpart", () => {
    const dosage = [createEmptyDosageRoute("Sublingual")];
    const duration = [
      createEmptyDurationRoute("Sublingual"),
      createEmptyDurationRoute("Oral", { half_life: "orphan" }),
    ];

    const paired = pairRoutesByName(dosage, duration);

    expect(paired.dosage.map((route) => route.route)).toEqual(["Sublingual", "Oral"]);
    expect(paired.duration.map((route) => route.route)).toEqual(["Sublingual", "Oral"]);
    expect(paired.duration[1].half_life).toBe("orphan");
  });

  it("matches route names case-insensitively without duplicating a route", () => {
    const paired = pairRoutesByName(
      [createEmptyDosageRoute("Sublingual")],
      [createEmptyDurationRoute("sublingual", { half_life: "2 hours" })],
    );

    expect(paired.dosage).toHaveLength(1);
    expect(paired.duration).toHaveLength(1);
    expect(paired.duration[0].route).toBe("Sublingual");
    expect(paired.duration[0].half_life).toBe("2 hours");
  });

  it("preserves fields it does not know about when matching by name", () => {
    const duration = [
      { ...createEmptyDurationRoute("Oral"), curated_note: "keep me" } as never,
    ];

    const paired = pairRoutesByName([createEmptyDosageRoute("Oral")], duration);

    expect(paired.duration[0]).toMatchObject({ curated_note: "keep me" });
  });

  it("creates an empty duration counterpart for a dosage-only route", () => {
    const paired = pairRoutesByName([createEmptyDosageRoute("Rectal")], []);

    expect(paired.duration).toEqual([createEmptyDurationRoute("Rectal")]);
  });

  it("keeps dosage order and appends duration-only routes after it", () => {
    const paired = pairRoutesByName(
      [createEmptyDosageRoute("Oral"), createEmptyDosageRoute("Intravenous")],
      [createEmptyDurationRoute("Rectal"), createEmptyDurationRoute("Oral")],
    );

    expect(paired.dosage.map((route) => route.route)).toEqual([
      "Oral",
      "Intravenous",
      "Rectal",
    ]);
    expect(paired.duration.map((route) => route.route)).toEqual([
      "Oral",
      "Intravenous",
      "Rectal",
    ]);
  });
});

describe("useArticleForm route reconciliation", () => {
  it("surfaces a duration-only route as an editable card instead of dropping it", async () => {
    const base = createArticle();
    const article: SubstanceArticle = {
      ...base,
      duration: {
        routes: [
          base.duration.routes[0],
          {
            ...base.duration.routes[0],
            route: "Insufflated",
            half_life: "orphan half-life",
          },
        ],
      },
    };
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("dosage.routes").map((route) => route.route),
      ).toEqual(["Oral", "Insufflated"]);
    });
    expect(
      latestForm?.methods.getValues("duration.routes").map((route) => route.route),
    ).toEqual(["Oral", "Insufflated"]);
    // The orphan's data must survive being surfaced.
    expect(latestForm?.methods.getValues("duration.routes")[1].half_life).toBe(
      "orphan half-life",
    );
  });

  it("removes both sides when deleting a formerly duration-only route", async () => {
    const base = createArticle();
    const article: SubstanceArticle = {
      ...base,
      duration: {
        routes: [
          base.duration.routes[0],
          { ...base.duration.routes[0], route: "Insufflated" },
        ],
      },
    };
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("dosage.routes").map((route) => route.route),
      ).toEqual(["Oral", "Insufflated"]);
    });

    act(() => {
      latestForm?.removeDosageRoute(1);
    });

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("dosage.routes").map((route) => route.route),
      ).toEqual(["Oral"]);
    });
    expect(
      latestForm?.methods.getValues("duration.routes").map((route) => route.route),
    ).toEqual(["Oral"]);
  });

  it("does not relabel duration data when routes are stored out of order", async () => {
    const base = createTwoRouteArticle();
    const article: SubstanceArticle = {
      ...base,
      duration: { routes: [base.duration.routes[1], base.duration.routes[0]] },
    };
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    await waitFor(() => {
      expect(
        latestForm?.methods.getValues("duration.routes").map((route) => route.route),
      ).toEqual(["Oral", "Smoked"]);
    });
    const durationRoutes = latestForm?.methods.getValues("duration.routes");
    expect(durationRoutes?.[0].half_life).toBe("4 hours");
    expect(durationRoutes?.[1].half_life).toBe("30 minutes");
  });
});
