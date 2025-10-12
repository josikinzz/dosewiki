import { useCallback, useState, type ChangeEvent } from "react";

import {
  ArticleDraftForm,
  ArticleDraftStringField,
  CitationEntryForm,
  DoseRangeForm,
  DurationForm,
  ToleranceForm,
  createEmptyArticleDraftForm,
  createEmptyCitationEntry,
  createEmptyRouteEntry,
} from "../utils/articleDraftForm";

type MutationCallback = () => void;

type ReplaceFormOptions = {
  emitMutate?: boolean;
};

type UseArticleDraftFormOptions = {
  initialState?: ArticleDraftForm;
  onMutate?: MutationCallback;
};

type FieldChangeHandler = (
  field: ArticleDraftStringField,
) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

type DurationChangeHandler = (
  field: keyof DurationForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type ToleranceChangeHandler = (
  field: keyof ToleranceForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type RouteChangeHandler = (
  index: number,
  field: "route" | "units",
) => (event: ChangeEvent<HTMLInputElement>) => void;

type DoseRangeChangeHandler = (
  index: number,
  field: keyof DoseRangeForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type CitationChangeHandler = (
  index: number,
  field: keyof CitationEntryForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

export type ArticleDraftFormController = {
  form: ArticleDraftForm;
  handleFieldChange: FieldChangeHandler;
  handleDurationFieldChange: DurationChangeHandler;
  handleToleranceFieldChange: ToleranceChangeHandler;
  handleRouteFieldChange: RouteChangeHandler;
  handleDoseRangeFieldChange: DoseRangeChangeHandler;
  addRouteEntry: () => void;
  removeRouteEntry: (index: number) => void;
  handleCitationFieldChange: CitationChangeHandler;
  addCitationEntry: () => void;
  removeCitationEntry: (index: number) => void;
  resetForm: () => void;
  replaceForm: (nextState: ArticleDraftForm, options?: ReplaceFormOptions) => void;
};

export const useArticleDraftForm = ({
  initialState = createEmptyArticleDraftForm(),
  onMutate,
}: UseArticleDraftFormOptions = {}): ArticleDraftFormController => {
  const [form, setForm] = useState<ArticleDraftForm>(initialState);

  const runMutation = useCallback(() => {
    if (onMutate) {
      onMutate();
    }
  }, [onMutate]);

  const replaceForm = useCallback(
    (nextState: ArticleDraftForm, options?: ReplaceFormOptions) => {
      if (options?.emitMutate ?? true) {
        runMutation();
      }
      setForm(nextState);
    },
    [runMutation],
  );

  const handleFieldChange: FieldChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        [field]: value,
      }));
    },
    [runMutation],
  );

  const handleDurationFieldChange: DurationChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        duration: {
          ...previous.duration,
          [field]: value,
        },
      }));
    },
    [runMutation],
  );

  const handleToleranceFieldChange: ToleranceChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        tolerance: {
          ...previous.tolerance,
          [field]: value,
        },
      }));
    },
    [runMutation],
  );

  const handleRouteFieldChange: RouteChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        routes: previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                [field]: value,
              }
            : route,
        ),
      }));
    },
    [runMutation],
  );

  const handleDoseRangeFieldChange: DoseRangeChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        routes: previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                doseRanges: {
                  ...route.doseRanges,
                  [field]: value,
                },
              }
            : route,
        ),
      }));
    },
    [runMutation],
  );

  const addRouteEntry = useCallback(() => {
    runMutation();
    setForm((previous) => ({
      ...previous,
      routes: [...previous.routes, createEmptyRouteEntry()],
    }));
  }, [runMutation]);

  const removeRouteEntry = useCallback(
    (index) => {
      runMutation();
      setForm((previous) => {
        if (previous.routes.length <= 1) {
          return {
            ...previous,
            routes: [createEmptyRouteEntry()],
          };
        }

        return {
          ...previous,
          routes: previous.routes.filter((_, routeIndex) => routeIndex !== index),
        };
      });
    },
    [runMutation],
  );

  const handleCitationFieldChange: CitationChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        citations: previous.citations.map((citation, citationIndex) =>
          citationIndex === index
            ? {
                ...citation,
                [field]: value,
              }
            : citation,
        ),
      }));
    },
    [runMutation],
  );

  const addCitationEntry = useCallback(() => {
    runMutation();
    setForm((previous) => ({
      ...previous,
      citations: [...previous.citations, createEmptyCitationEntry()],
    }));
  }, [runMutation]);

  const removeCitationEntry = useCallback(
    (index) => {
      runMutation();
      setForm((previous) => {
        if (previous.citations.length <= 1) {
          return {
            ...previous,
            citations: [createEmptyCitationEntry()],
          };
        }

        return {
          ...previous,
          citations: previous.citations.filter((_, citationIndex) => citationIndex !== index),
        };
      });
    },
    [runMutation],
  );

  const resetForm = useCallback(() => {
    replaceForm(createEmptyArticleDraftForm());
  }, [replaceForm]);

  return {
    form,
    handleFieldChange,
    handleDurationFieldChange,
    handleToleranceFieldChange,
    handleRouteFieldChange,
    handleDoseRangeFieldChange,
    addRouteEntry,
    removeRouteEntry,
    handleCitationFieldChange,
    addCitationEntry,
    removeCitationEntry,
    resetForm,
    replaceForm,
  };
};
