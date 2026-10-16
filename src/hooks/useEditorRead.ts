"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { api, FunctionArgs, FunctionReturnType } from "@server/postgres/runtime/api";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";

const EDITOR_LIST_REFETCH_MS = 15_000;
const EDITOR_DOCUMENT_REFETCH_MS = 5_000;

export type EditorReadFreshness = "list" | "document";

type EditorReadCatalog = {
  "indexLayouts:getAll": typeof api.indexLayouts.getAll;
  "categoryLayout:get": typeof api.categoryLayout.get;
  "contributorProfiles:getAll": typeof api.contributorProfiles.getAll;
  "changelog:getRecent": typeof api.changelog.getRecent;
  "copyBlocks:getEditorCatalogue": typeof api.copyBlocks.getEditorCatalogue;
  "moleculeOverrides:listSlugs": typeof api.moleculeOverrides.listSlugs;
  "moleculeOverrides:getBySlug": typeof api.moleculeOverrides.getBySlug;
  "moleculeOverrides:getMetadataBySlug": typeof api.moleculeOverrides.getMetadataBySlug;
  "substanceIndex:getBySlug": typeof api.substanceIndex.getBySlug;
  "siteConfig:getBannerDisplay": typeof api.siteConfig.getBannerDisplay;
};

type EditorPaginatedReadCatalog = {
  "substanceIndex:getLookupPage": typeof api.substanceIndex.getLookupPage;
  "substanceIndex:getSearchInputPage": typeof api.substanceIndex.getSearchInputPage;
};

export type EditorReadName = keyof EditorReadCatalog;
export type EditorPaginatedReadName = keyof EditorPaginatedReadCatalog;
export type EditorReadArgs<N extends EditorReadName> = FunctionArgs<EditorReadCatalog[N]>;
export type EditorReadResult<N extends EditorReadName> = FunctionReturnType<EditorReadCatalog[N]>;
type EditorPage<N extends EditorPaginatedReadName> = FunctionReturnType<EditorPaginatedReadCatalog[N]>;
export type EditorPaginatedReadItem<N extends EditorPaginatedReadName> = EditorPage<N>["page"][number];

const slugQuery = (slug: string) => `slug=${encodeURIComponent(slug)}`;

const EDITOR_READ_ROUTES: { [N in EditorReadName]: (args: EditorReadArgs<N>) => string } = {
  "indexLayouts:getAll": () => "/api/editor/index-layouts",
  "categoryLayout:get": () => "/api/editor/category-layout",
  "contributorProfiles:getAll": () => "/api/editor/contributor-profiles",
  "changelog:getRecent": ({ limit }) => `/api/editor/changelog?limit=${limit ?? 50}`,
  "copyBlocks:getEditorCatalogue": () => "/api/editor/copy-blocks",
  "moleculeOverrides:listSlugs": () => "/api/editor/molecule-overrides",
  "moleculeOverrides:getBySlug": ({ slug }) => `/api/editor/molecule-overrides?${slugQuery(slug)}`,
  "moleculeOverrides:getMetadataBySlug": ({ slug }) => `/api/editor/molecule-overrides?${slugQuery(slug)}&scope=metadata`,
  "substanceIndex:getBySlug": ({ slug }) => `/api/editor/substances?${slugQuery(slug)}`,
  "siteConfig:getBannerDisplay": () => "/api/editor/banner-display",
};

const EDITOR_PAGE_ROUTES: { [N in EditorPaginatedReadName]: string } = {
  "substanceIndex:getLookupPage": "/api/editor/substances?page=lookup",
  "substanceIndex:getSearchInputPage": "/api/editor/substances?page=search-input",
};

function editorReadKey(name: EditorReadName | EditorPaginatedReadName, args?: Record<string, unknown>) {
  return args === undefined ? (["editor", name] as const) : (["editor", name, args] as const);
}

async function fetchEditorJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Editor read failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function freshnessOptions(freshness: EditorReadFreshness) {
  return {
    staleTime: 0,
    refetchOnWindowFocus: true as const,
    refetchInterval: freshness === "document" ? EDITOR_DOCUMENT_REFETCH_MS : EDITOR_LIST_REFETCH_MS,
  };
}

export type EditorIndexLayoutRows = Array<ManualIndexConfig & {
  type: "psychoactive" | "chemical" | "mechanism";
  revision: number;
}>;

export function useEditorIndexLayouts(enabled: boolean) {
  const session = useSession();
  const owner = session.status === "authenticated" ? session.data?.user?.email ?? "" : "";
  const canRead = enabled && session.status === "authenticated";
  const queryClient = useQueryClient();
  const query = useQuery<EditorIndexLayoutRows, Error>({
    queryKey: editorReadKey("indexLayouts:getAll", { scope: "editor", owner }),
    queryFn: ({ signal }) => fetchEditorJson<EditorIndexLayoutRows>("/api/dev/index-layout?type=all", signal),
    enabled: canRead,
    throwOnError: false,
    ...freshnessOptions("list"),
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (session.status !== "unauthenticated") return;
    queryClient.removeQueries({ queryKey: editorReadKey("indexLayouts:getAll") });
  }, [queryClient, session.status]);

  return {
    data: canRead ? query.data : undefined,
    error: canRead && query.error ? query.error.message : null,
    isLoading: canRead && query.data === undefined && query.error === null,
    retry,
  };
}

function throwWhenEmpty(_error: Error, query: { state: { data: unknown } }) {
  return query.state.data === undefined;
}

export function useEditorRead<N extends EditorReadName>(
  name: N,
  args: EditorReadArgs<N> | "skip",
  freshness: EditorReadFreshness,
): EditorReadResult<N> | undefined {
  const enabled = args !== "skip";
  const query = useQuery<EditorReadResult<N>, Error>({
    queryKey: editorReadKey(name, args === "skip" ? { skip: true } : args),
    queryFn: ({ signal }) => fetchEditorJson<EditorReadResult<N>>(EDITOR_READ_ROUTES[name](args as EditorReadArgs<N>), signal),
    enabled,
    throwOnError: throwWhenEmpty,
    ...freshnessOptions(freshness),
  });
  return query.data;
}

export type EditorReadState<N extends EditorReadName> = {
  data: EditorReadResult<N> | undefined;
  error: string | null;
  fetching: boolean;
  retry: () => void;
};

export function useEditorReadState<N extends EditorReadName>(
  name: N,
  args: EditorReadArgs<N> | "skip",
  freshness: EditorReadFreshness,
): EditorReadState<N> {
  const enabled = args !== "skip";
  const query = useQuery<EditorReadResult<N>, Error>({
    queryKey: editorReadKey(name, args === "skip" ? { skip: true } : args),
    queryFn: ({ signal }) => fetchEditorJson<EditorReadResult<N>>(EDITOR_READ_ROUTES[name](args as EditorReadArgs<N>), signal),
    enabled,
    throwOnError: false,
    ...freshnessOptions(freshness),
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    data: query.data,
    error: enabled && query.data === undefined && query.error ? query.error.message : null,
    fetching: enabled && query.isFetching,
    retry,
  };
}

export type EditorPaginatedStatus ="LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

function useEditorPaginatedRead<N extends EditorPaginatedReadName>(
  name: N,
  args: Record<string, never> | "skip",
  options: { initialNumItems: number },
): { results: EditorPaginatedReadItem<N>[]; status: EditorPaginatedStatus; loadMore: (numItems: number) => void } {
  const enabled = args !== "skip";
  const numItems = options.initialNumItems;
  const query = useInfiniteQuery<EditorPage<N>, Error, { pages: EditorPage<N>[] }, readonly unknown[], string | null>({
    queryKey: editorReadKey(name, enabled ? { numItems } : { skip: true }),
    queryFn: ({ pageParam, signal }) =>
      fetchEditorJson<EditorPage<N>>(
        `${EDITOR_PAGE_ROUTES[name]}&numItems=${numItems}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
    enabled,
    throwOnError: throwWhenEmpty,
    ...freshnessOptions("list"),
  });

  const pages = query.data?.pages;
  const results = useMemo(() => {
    const items: EditorPaginatedReadItem<N>[] = [];
    for (const page of pages ?? []) items.push(...(page.page as EditorPaginatedReadItem<N>[]));
    return items;
  }, [pages]);
  const status: EditorPaginatedStatus = !enabled || pages === undefined
    ? "LoadingFirstPage"
    : query.isFetchingNextPage
      ? "LoadingMore"
      : query.hasNextPage
        ? "CanLoadMore"
        : "Exhausted";

  const { fetchNextPage } = query;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return { results, status, loadMore };
}

export function useEditorDrainedRead<N extends EditorPaginatedReadName>(
  name: N,
  args: Record<string, never> | "skip",
  options: { initialNumItems: number },
): { results: EditorPaginatedReadItem<N>[] | undefined; status: EditorPaginatedStatus } {
  const { results, status, loadMore } = useEditorPaginatedRead(name, args, options);
  useEffect(() => {
    if (args !== "skip" && status === "CanLoadMore") {
      loadMore(options.initialNumItems);
    }
  }, [args, loadMore, options.initialNumItems, status]);
  return { results: args !== "skip" && status === "Exhausted" ? results : undefined, status };
}

export function useInvalidateEditorReads() {
  const queryClient = useQueryClient();
  return useCallback(
    (names: ReadonlyArray<EditorReadName | EditorPaginatedReadName>) =>
      Promise.all(names.map((name) => queryClient.invalidateQueries({ queryKey: editorReadKey(name) }))).then(() => undefined),
    [queryClient],
  );
}
