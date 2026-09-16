import { vi } from "vitest";

import type { Id } from "@server/postgres/runtime/dataModel";
import type { MutationCtx } from "@server/postgres/runtime/server";

export const PROFILE_ID = "profile-existing" as Id<"contributorProfiles">;

export function profile(overrides: Record<string, unknown> = {}) {
  return {
    key: "ARTIST",
    displayName: "Artist Name",
    aliases: ["artist name"],
    avatarStorageId: null,
    avatarR2Key: null,
    avatarUrl: null,
    bio: "Existing bio",
    role: "Replication Artist",
    links: [],
    ...overrides,
  };
}

export function storedProfile(
  overrides: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
) {
  const value = profile(overrides);
  return {
    _id: PROFILE_ID,
    _creationTime: 1,
    key: value.key,
    displayName: value.displayName,
    aliases: value.aliases,
    ...(value.avatarStorageId ? { avatarStorageId: value.avatarStorageId } : {}),
    ...(value.avatarR2Key ? { avatarR2Key: value.avatarR2Key } : {}),
    ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
    bio: value.bio,
    ...(value.role ? { role: value.role } : {}),
    links: value.links,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...metadata,
  };
}

export function mutationContext(
  initialRows: Record<string, unknown>[] = [],
  options: {
    authenticated?: boolean;
    role?: "admin" | "editor" | "viewer";
    storageUrls?: Record<string, string | null>;
  } = {},
) {
  const rows = [...initialRows];
  const patch = vi.fn(async (id: string, value: Record<string, unknown>) => {
    const row = rows.find((candidate) => candidate._id === id);
    if (row) Object.assign(row, value);
  });
  const insert = vi.fn(async (_table: string, value: Record<string, unknown>) => {
    rows.push({ _id: "profile-created", _creationTime: 2, ...value });
    return "profile-created";
  });
  const remove = vi.fn(async (id: string) => {
    const index = rows.findIndex((candidate) => candidate._id === id);
    if (index >= 0) rows.splice(index, 1);
  });
  const query = vi.fn((table: string) => {
    const tableRows = table === "contributorProfiles" ? rows : [];
    return {
      take: async (limit: number) => tableRows.slice(0, limit),
      withIndex: (_index: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      let field = "";
      let value: unknown;
      apply({
        eq(nextField, nextValue) {
          field = nextField;
          value = nextValue;
          return this;
        },
      });
      const matches =
        table === "memberships"
          ? [{ email: "editor@example.com", role: options.role ?? "admin" }]
          : rows.filter((row) => row[field] === value);
      return {
        unique: async () => matches[0] ?? null,
        take: async (limit: number) => matches.slice(0, limit),
      };
      },
    };
  });
  const ctx = {
    auth: {
      getUserIdentity: async () =>
        options.authenticated === false
          ? null
          : {
              subject: "editor",
              email: "editor@example.com",
              name: "Editor",
            },
    },
    db: {
      get: vi.fn(async (id: string) => rows.find((row) => row._id === id) ?? null),
      insert,
      patch,
      delete: remove,
      query,
    },
    storage: {
      getUrl: vi.fn(async (id: string) => options.storageUrls?.[id] ?? null),
    },
  } as unknown as MutationCtx;
  return { ctx, insert, patch, remove, rows };
}
