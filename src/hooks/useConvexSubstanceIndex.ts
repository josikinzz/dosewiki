/**
 * Hook for loading and managing substance index from Convex.
 *
 * This hook provides reactive access to substances stored in Convex.
 * When substances are updated in Convex, subscribed components automatically re-render.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import type { SubstanceArticle } from "../schema";
import type { SubstanceLibraryInputProjection } from "../../convex/lib/substanceReadProjections";

/**
 * Hook to get all substances from Convex.
 * Returns undefined while loading, then the array of substances.
 *
 * This is a reactive subscription - updates automatically when data changes.
 */
export function useConvexSubstanceIndex() {
  const enabled = isConvexEnabled();

  // Only call useQuery if Convex is enabled
  // When disabled, this returns undefined
  const substances = useQuery(
    enabled ? api.substanceIndex.getLibraryInput : undefined as never
  );

  return {
    substances: substances as SubstanceLibraryInputProjection[] | undefined,
    isLoading: enabled && substances === undefined,
    isEnabled: enabled,
  };
}

/**
 * Hook to get a single substance by its ID.
 */
export function useConvexSubstance(id: number | null) {
  const enabled = isConvexEnabled() && id !== null;

  const substance = useQuery(
    enabled ? api.substanceIndex.getEditorById : undefined as never,
    enabled ? { id: id as number } : undefined as never
  );

  return {
    substance: substance as unknown as SubstanceArticle | null | undefined,
    isLoading: enabled && substance === undefined,
    isEnabled: isConvexEnabled(),
  };
}

/**
 * Hook to get a single substance by title.
 */
export function useConvexSubstanceByTitle(title: string | null) {
  const enabled = isConvexEnabled() && title !== null;

  const substance = useQuery(
    enabled ? api.substanceIndex.getEditorByTitle : undefined as never,
    enabled ? { title: title as string } : undefined as never
  );

  return {
    substance: substance as unknown as SubstanceArticle | null | undefined,
    isLoading: enabled && substance === undefined,
    isEnabled: isConvexEnabled(),
  };
}

/**
 * Hook to save a single substance to Convex.
 */
export function useSaveConvexSubstance() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.substanceIndex.saveSubstance);

  return {
    saveSubstance: enabled ? mutation : null,
    isEnabled: enabled,
  };
}

/**
 * Hook to save multiple substances to Convex.
 */
export function useSaveConvexSubstances() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.substanceIndex.saveSubstances);

  return {
    saveSubstances: enabled ? mutation : null,
    isEnabled: enabled,
  };
}

/**
 * Hook to replace all substances in Convex (bulk sync).
 */
export function useReplaceAllConvexSubstances() {
  return {
    replaceAllSubstances: null,
    isEnabled: false,
  };
}

/**
 * Hook to delete a substance from Convex.
 */
export function useDeleteConvexSubstance() {
  const enabled = isConvexEnabled();
  const mutation = useMutation(api.substanceIndex.deleteSubstance);

  return {
    deleteSubstance: enabled ? mutation : null,
    isEnabled: enabled,
  };
}
