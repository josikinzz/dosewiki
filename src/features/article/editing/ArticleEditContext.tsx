"use client";

import { createContext, useContext } from "react";

import type { EditableFieldValue } from "../../../../server/lib/articleFieldWrites";
import type { Reference } from "@/schema";
import type { CitationMarkerSpan } from "@/lib/citations/citationTokens";

export type { EditableFieldValue } from "../../../../server/lib/articleFieldWrites";

export type EditableValueInput =
  | string
  | { min?: number | null; max?: number | null; unit?: string };

export const ARTICLE_FIELD_CONFLICT_CODE = "FIELD_CONFLICT";

export class ArticleFieldCommitError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "ArticleFieldCommitError";
    this.code = code ?? null;
  }
}

export function isArticleFieldConflict(error: unknown): boolean {
  return (
    error instanceof ArticleFieldCommitError &&
    error.code === ARTICLE_FIELD_CONFLICT_CODE
  );
}

export interface ArticleEditContextValue {
  registerDraft?: (path: string, draft: {
    save: () => Promise<void>;
    discard: () => void;
  }) => () => void;
  commit: (
    path: string,
    value: EditableFieldValue,
    expected: EditableFieldValue,
  ) => Promise<EditableFieldValue>;
  refreshStoredValue?: (
    path: string,
    like: EditableFieldValue,
  ) => EditableFieldValue | null;
  addReference?: (reference: Reference) => string;
  references?: Reference[];
  isChanged?: (path: string) => boolean;
  fieldIssue?: (path: string) => string | null;
}

const ArticleEditContext = createContext<ArticleEditContextValue | null>(null);

export const ArticleEditProvider = ArticleEditContext.Provider;

export function useArticleEdit(): ArticleEditContextValue | null {
  return useContext(ArticleEditContext);
}

export interface FieldMarkerContextValue {
  markers: CitationMarkerSpan[];
  citeAtMarker: (marker: CitationMarkerSpan) => void;
  removeMarker: (marker: CitationMarkerSpan) => void;
}

const FieldMarkerContext = createContext<FieldMarkerContextValue | null>(null);

export const FieldMarkerProvider = FieldMarkerContext.Provider;

export function useFieldMarkers(): FieldMarkerContextValue | null {
  return useContext(FieldMarkerContext);
}

export function findMarker(
  markers: CitationMarkerSpan[],
  kind: CitationMarkerSpan["kind"],
  ordinal: number,
): CitationMarkerSpan | null {
  return markers.find((marker) => marker.kind === kind && marker.ordinal === ordinal) ?? null;
}
