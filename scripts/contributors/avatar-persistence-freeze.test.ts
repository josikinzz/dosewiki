import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/postgres/runtime/api";

const media = vi.hoisted(() => ({ freezeOnRender: false }));
const sinks = vi.hoisted(() => ({ files: [] as string[], mutations: [] as string[] }));

vi.mock("./generate-avatar-media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generate-avatar-media")>()),
  fetchBytes: async () => Buffer.from("source"),
  orientImage: async (bytes: Buffer) => ({ bytes, dimensions: { width: 512, height: 512 } }),
  renderAvatar: async () => {
    if (media.freezeOnRender) process.env.DATA_WRITES_FROZEN = "1";
    return { bytes: Buffer.from("webp"), size: 256 };
  },
  meanLuminance: async () => 128,
}));

vi.mock("../lib/production-write-command.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/production-write-command.mjs")>();
  return {
    ...actual,
    createProductionWriteCommand: (options: Record<string, unknown>) =>
      actual.createProductionWriteCommand({ ...options, loadsEnvLocal: false }),
    requireProductionWriteCredential: () => ({ token: "synthetic-intent-token" }),
  };
});

const rows = vi.hoisted(() => ({
  profiles: [{ key: "EXAMPLEARTIST", displayName: "Example Artist", aliases: [], avatarUrl: null }],
  stored: [
    {
      key: "EXAMPLEARTIST",
      displayName: "Example Artist",
      aliases: [],
      bio: "",
      links: [],
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "editor@example.com",
    },
  ],
  replications: [
    { slug: "example-work", artist: "Example Artist", type: "image", role: "replication", storage_id: "storage-1" },
  ],
}));

vi.mock("../lib/data-client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/data-client.ts")>()),
  resolvePostgresSource: () => ({ url: "postgres://reader@127.0.0.1:1/dosewiki" }),
  createDataClient: () => ({
    client: {
      query: async (reference: unknown) => {
        if (reference === api.contributorProfiles.getAll) return rows.profiles;
        if (reference === api.replications.getAll) return rows.replications;
        if (reference === api.replications.resolveStorageUrls) return ["https://media.example/example-work.png"];
        if (reference === api.contributorProfiles.getForBulkImport) return rows.stored;
        throw new Error("unexpected query");
      },
      mutation: async (reference: unknown) => {
        sinks.mutations.push(reference === api.contributorProfiles.bulkImport ? "bulkImport" : "other");
        return { created: 0, updated: 1 };
      },
    },
  }),
}));

const { main: generateFromReplications } = await import("./generate-avatars-from-replications");
const { main: importFromTheWild } = await import("./import-avatars-from-the-wild");
const { MANIFEST_PATH, ROOT } = await import("./generate-avatar-files");

const PUBLIC_AVATARS = path.join(ROOT, "public/profile-avatars");
const TARGET = "postgres://operator@127.0.0.1:5432/dosewiki";

let scratch: string;
let savedArgv: string[];
let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "avatar-freeze-"));
  savedArgv = process.argv;
  savedEnv = { ...process.env };
  process.env.DATA_BACKEND = "postgres";
  process.env.TARGET_POSTGRES_URL = TARGET;
  delete process.env.DATA_WRITES_FROZEN;
  media.freezeOnRender = false;
  sinks.files.length = 0;
  sinks.mutations.length = 0;
  const writeFileSync = fs.writeFileSync;
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...rest) => {
    const filePath = path.resolve(String(file));
    if (filePath.startsWith(scratch)) return writeFileSync(file, ...rest);
    sinks.files.push(filePath);
  });
  const mkdirSync = fs.mkdirSync;
  vi.spyOn(fs, "mkdirSync").mockImplementation((dir, options) =>
    path.resolve(String(dir)).startsWith(scratch) ? mkdirSync(dir, options) : undefined,
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = savedArgv;
  process.env = savedEnv;
  fs.rmSync(scratch, { recursive: true, force: true });
});

function invoke(operation: string, extra: string[], { write = true } = {}) {
  const ceremony = write
    ? ["--write", `--confirm-write=${operation}`, "--expected-deployment=127.0.0.1/dosewiki"]
    : [];
  process.argv = ["bun", operation, ...ceremony, ...extra];
}

function wildArguments() {
  const findings = path.join(scratch, "findings.json");
  fs.writeFileSync(
    findings,
    JSON.stringify([
      {
        artist: "Example Artist",
        imageUrl: "https://media.example/portrait.png",
        evidence: "synthetic",
        confidence: "high",
      },
    ]),
  );
  return [`--findings=${findings}`, `--manifest=${path.join(scratch, "wild-manifest.json")}`];
}

function persistentSinks(wildManifest?: string) {
  return sinks.files.filter(
    (file) => file.startsWith(PUBLIC_AVATARS) || file === MANIFEST_PATH || file === wildManifest,
  );
}

describe("avatar persistence under a freeze raised mid-run", () => {
  it("generation installs and records avatars when writes stay open", async () => {
    invoke("generate-contributor-avatars", []);
    await generateFromReplications();
    expect(persistentSinks()).toEqual([path.join(PUBLIC_AVATARS, "exampleartist/avatar.webp"), MANIFEST_PATH]);
    expect(sinks.mutations).toEqual(["bulkImport"]);
  });

  it("generation touches no public avatar, manifest, or row once the freeze rises during render", async () => {
    media.freezeOnRender = true;
    invoke("generate-contributor-avatars", []);
    await expect(generateFromReplications()).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(persistentSinks()).toEqual([]);
    expect(sinks.mutations).toEqual([]);
  });

  it("generation still renders a disposable preview while frozen", async () => {
    process.env.DATA_WRITES_FROZEN = "1";
    const previewDir = path.join(scratch, "preview");
    invoke("generate-contributor-avatars", [`--preview-dir=${previewDir}`], { write: false });
    await generateFromReplications();
    expect(fs.existsSync(path.join(previewDir, "exampleartist/avatar.webp"))).toBe(true);
    expect(persistentSinks()).toEqual([]);
  });

  it("refuses a preview directory inside the public avatar tree", async () => {
    invoke("generate-contributor-avatars", [`--preview-dir=${PUBLIC_AVATARS}`], { write: false });
    await expect(generateFromReplications()).rejects.toThrow(/disposable/);
    expect(persistentSinks()).toEqual([]);
  });

  it("the wild importer installs and records avatars when writes stay open", async () => {
    const extra = wildArguments();
    const wildManifest = path.join(scratch, "wild-manifest.json");
    invoke("import-wild-avatars", extra);
    await importFromTheWild();
    expect(persistentSinks(wildManifest)).toEqual([
      path.join(PUBLIC_AVATARS, "exampleartist/avatar.webp"),
      MANIFEST_PATH,
    ]);
    expect(fs.existsSync(wildManifest)).toBe(true);
    expect(sinks.mutations).toEqual(["bulkImport"]);
  });

  it("the wild importer touches no public avatar, manifest, or row once the freeze rises during render", async () => {
    media.freezeOnRender = true;
    const extra = wildArguments();
    const wildManifest = path.join(scratch, "wild-manifest.json");
    invoke("import-wild-avatars", extra);
    await expect(importFromTheWild()).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(persistentSinks(wildManifest)).toEqual([]);
    expect(fs.existsSync(wildManifest)).toBe(false);
    expect(sinks.mutations).toEqual([]);
  });

  it("the wild importer still renders a disposable preview while frozen", async () => {
    process.env.DATA_WRITES_FROZEN = "1";
    const previewDir = path.join(scratch, "preview");
    invoke("import-wild-avatars", [...wildArguments(), `--preview-dir=${previewDir}`], { write: false });
    await importFromTheWild();
    expect(fs.existsSync(path.join(previewDir, "exampleartist/avatar.webp"))).toBe(true);
    expect(persistentSinks()).toEqual([]);
  });
});
