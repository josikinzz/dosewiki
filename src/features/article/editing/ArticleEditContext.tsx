"use client";

import { createContext, useContext } from "react";

import type { EditableFieldValue } from "../../../../server/lib/articleFieldWrites";
import type { Reference } from "@/schema";
import type { CitationMarkerSpan } from "@/lib/citations/citationTokens";

export type { EditableFieldValue } from "../../../../server/lib/articleFieldWrites";

/**
 * What a call site may hand an editable field.
 *
 * Looser than `EditableFieldValue` on purpose. The wire contract spells a range
 * as `{min: number | null, max: number | null, unit: string}`, but this project
 * compiles with `strictNullChecks` off, so the schema's own `DoseRange` and
 * `DurationStage` infer their bounds as optional instead. The two describe the
 * same runtime object; only the compiler disagrees, and a render site should
 * not have to cast its own schema type to hand it over.
 */
export type EditableValueInput =
  | string
  | { min?: number | null; max?: number | null; unit?: string };

/**
 * The write layer's code for "the stored value moved under you".
 *
 * The wire contract is `{ error, code }` where `code` is the stable half and
 * `error` is copy that will be reworded (see `src/lib/http/dataRejection.ts`).
 * Branching on the code is the only supported way to recognise a conflict;
 * matching the sentence is not.
 */
export const ARTICLE_FIELD_CONFLICT_CODE = "FIELD_CONFLICT";

/**
 * A commit rejection that still carries the write layer's stable code.
 *
 * `message` stays the human sentence the field renders verbatim. `code` is
 * absent whenever the failure was not an actionable refusal — an internal 500,
 * a dropped connection — which is exactly the case where a client must not
 * pretend to know what went wrong.
 */
export class ArticleFieldCommitError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "ArticleFieldCommitError";
    this.code = code ?? null;
  }
}

/** Whether a rejected commit was refused because the stored value moved. */
export function isArticleFieldConflict(error: unknown): boolean {
  return (
    error instanceof ArticleFieldCommitError &&
    error.code === ARTICLE_FIELD_CONFLICT_CODE
  );
}

/**
 * Apply one inline field to the current local preview. Durable private saving
 * and publication are separate, explicitly confirmed article lifecycle actions.
 *
 * Deliberately tiny. The public article path never provides this context, so
 * every `EditableValue` collapses to its children and the rendered DOM is
 * unchanged — the affordance exists only where an editor opted in.
 */
export interface ArticleEditContextValue {
  registerDraft?: (path: string, draft: {
    save: () => Promise<void>;
    discard: () => void;
  }) => () => void;
  /**
   * Rejects with a human-readable `Error` the field can render inline.
   *
   * `expected` is the value the field held on screen. Paths carry concrete
   * array indices, and the rendered article can be a local draft that has been
   * reordered since the field opened, so local application is safe only when
   * the current draft still agrees about what sits at that index.
   *
   * A value is either prose or a `{min, max, unit}` range; the kind is fixed by
   * the path's entry in the inline-edit allow-list, and both sides of the
   * exchange are validated against it before anything is written.
   */
  commit: (
    path: string,
    value: EditableFieldValue,
    expected: EditableFieldValue,
  ) => Promise<EditableFieldValue>;
  /**
   * The value the surface now holds at `path` in its local preview, for a field
   * whose local application was refused as stale.
   *
   * Returns `null` when the surface has nothing fresher than what it already
   * rendered, which is the honest answer rather than a guess — a field with no
   * fresher value to offer shows the refusal alone and nothing to click.
   *
   * Synchronous because the surfaces that can answer this hold a live
   * subscription and already have the newer value in memory; the conflict is
   * the reader being pinned to an older copy of it, not the value being absent.
   * Optional because a surface that cannot answer must not have to lie.
   *
   * `like` fixes the kind the caller can use — prose or a `{min, max, unit}`
   * range — so a path holding the other kind answers `null` rather than
   * something the field would have to coerce.
   */
  refreshStoredValue?: (
    path: string,
    like: EditableFieldValue,
  ) => EditableFieldValue | null;
  /**
   * Append one reference to the local preview and answer with the id a
   * citation marker must address.
   *
   * A source the article already cites answers with its own stored id and
   * appends nothing, so citing the same paper from two sentences cannot fork
   * it into two references. Synchronous because the surface holds the article
   * in memory; minting an id needs no round trip.
   *
   * Optional for the same reason as `registerDraft`: a surface that cannot
   * hold a new reference must not have to pretend it can.
   */
  addReference?: (reference: Reference) => string;
  /**
   * The sources the local preview already cites, so a field can offer one for
   * reuse instead of minting a second reference for the same paper. Empty or
   * absent means the surface has none to offer, never that the article has no
   * references.
   */
  references?: Reference[];
}

const ArticleEditContext = createContext<ArticleEditContextValue | null>(null);

export const ArticleEditProvider = ArticleEditContext.Provider;

/** `null` on the public path; a commit handle inside an editing surface. */
export function useArticleEdit(): ArticleEditContextValue | null {
  return useContext(ArticleEditContext);
}

/**
 * What a rendered citation marker can do to the field that contains it.
 *
 * A marker is drawn deep inside prose by `CitedText`, which knows the text but
 * not the field path. The editable field knows the path and holds the raw
 * value, so it publishes this instead of every section threading a path down
 * to each marker.
 *
 * This lives beside `ArticleEditContextValue` because the public renderer
 * consumes it: `public-editor-boundary.mjs` admits exactly this module and the
 * feature's barrel into the public browser build, and a marker has to behave
 * as a plain link and a plain flag there.
 */
export interface FieldMarkerContextValue {
  /**
   * Markers present in the field's RAW value. A render site addresses one by
   * kind and ordinal; a marker the renderer synthesized for display (the
   * legality note's appended sentinel, for one) has no entry here and stays
   * non-interactive, because there is nothing in the stored text to rewrite.
   */
  markers: CitationMarkerSpan[];
  /**
   * Open the field with the caret at this marker and the cite control already
   * showing. Used by a citation-needed flag, whose whole purpose is to be
   * replaced by a real citation.
   */
  citeAtMarker: (marker: CitationMarkerSpan) => void;
  /** Remove exactly this marker from the field. The reference itself stays. */
  removeMarker: (marker: CitationMarkerSpan) => void;
}

const FieldMarkerContext = createContext<FieldMarkerContextValue | null>(null);

export const FieldMarkerProvider = FieldMarkerContext.Provider;

/** `null` wherever markers are read-only, which is every public render. */
export function useFieldMarkers(): FieldMarkerContextValue | null {
  return useContext(FieldMarkerContext);
}

/** The nth marker of one kind in the field's raw value, when it exists. */
export function findMarker(
  markers: CitationMarkerSpan[],
  kind: CitationMarkerSpan["kind"],
  ordinal: number,
): CitationMarkerSpan | null {
  return markers.find((marker) => marker.kind === kind && marker.ordinal === ordinal) ?? null;
}
