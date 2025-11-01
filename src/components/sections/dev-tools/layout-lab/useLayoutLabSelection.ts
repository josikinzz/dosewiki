import { useEffect, useMemo, useState } from "react";

export interface LayoutLabOption {
  slug: string;
  label: string;
  searchText: string;
  index: number;
  aliases?: string[];
}

interface LayoutLabSelection {
  query: string;
  setQuery: (value: string) => void;
  selectedSlug: string | null;
  selectSlug: (slug: string) => void;
  suggestions: LayoutLabOption[];
  selectedOption: LayoutLabOption | null;
}

const MAX_SUGGESTIONS = 12;

export function useLayoutLabSelection(
  options: LayoutLabOption[],
  defaultSlug: string | null | undefined,
): LayoutLabSelection {
  const optionBySlug = useMemo(() => {
    const map = new Map<string, LayoutLabOption>();
    options.forEach((option) => {
      map.set(option.slug, option);
    });
    return map;
  }, [options]);

  const [query, setQuery] = useState<string>("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!options.length) {
      setSelectedSlug(null);
      return;
    }

    if (selectedSlug && optionBySlug.has(selectedSlug)) {
      return;
    }

    const fallbackSlug = options[0]?.slug ?? null;
    setSelectedSlug((previous) => previous ?? fallbackSlug);
    if (!query && fallbackSlug) {
      const fallbackOption = optionBySlug.get(fallbackSlug);
      if (fallbackOption) {
        setQuery(fallbackOption.label);
      }
    }
  }, [optionBySlug, options, query, selectedSlug]);

  useEffect(() => {
    if (!defaultSlug) {
      return;
    }
    if (!optionBySlug.has(defaultSlug)) {
      return;
    }
    setSelectedSlug((previous) => previous ?? defaultSlug);
    if (!query) {
      const defaultOption = optionBySlug.get(defaultSlug);
      if (defaultOption) {
        setQuery(defaultOption.label);
      }
    }
  }, [defaultSlug, optionBySlug, query]);

  const selectSlug = (slug: string) => {
    if (!optionBySlug.has(slug)) {
      return;
    }
    const option = optionBySlug.get(slug);
    setSelectedSlug(slug);
    if (option) {
      setQuery(option.label);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!normalizedQuery) {
      return options.slice(0, MAX_SUGGESTIONS);
    }

    return options
      .filter((option) => option.searchText.includes(normalizedQuery))
      .slice(0, MAX_SUGGESTIONS);
  }, [normalizedQuery, options]);

  const selectedOption = selectedSlug ? optionBySlug.get(selectedSlug) ?? null : null;

  return {
    query,
    setQuery,
    selectedSlug,
    selectSlug,
    suggestions,
    selectedOption,
  };
}
