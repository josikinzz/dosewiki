import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generateSectionProposal, parseProposalArgs } from "./generate-section-proposal.mjs";

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const postgresApi = {
  substanceIndex: { getBySlug: "substanceIndex.getBySlug" },
  prompts: { getByKey: "prompts.getByKey" },
  quotes: { getBySlugAndSection: "quotes.getBySlugAndSection" },
  articleSources: { getBySlug: "articleSources.getBySlug" },
};

const sourceArticle = {
  _id: "source-article",
  _creationTime: 1,
  id: 22,
  slug: "2c-b",
  title: "2C-B",
  summary: "source deployment summary",
  classification: { psychoactive_class: ["psychedelic"], chemical_class: ["phenethylamine"] },
  pharmacology: { pharmacodynamics: "source pharmacology" },
  dosage: { routes: [{ route: "Oral", bioavailability: "" }] },
  duration: { routes: [{ route: "Oral", half_life: "" }] },
};
const targetArticle = {
  _id: "target-article",
  _creationTime: 2,
  id: 22,
  slug: "2c-b",
  title: "2C-B",
  summary: "target deployment summary",
  classification: { psychoactive_class: ["psychedelic"], chemical_class: ["phenethylamine"] },
  pharmacology: { pharmacodynamics: "target pharmacology" },
  dosage: { routes: [{ route: "Oral", bioavailability: "" }] },
  duration: { routes: [{ route: "Oral", half_life: "" }] },
};
const prompt = {
  _id: "prompt",
  _creationTime: 3,
  key: "section_summary",
  content: "exact prompt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const quote = {
  _id: "quote",
  _creationTime: 4,
  slug: "2c-b",
  section: "summary",
  content: "exact excerpt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const pharmacologyPrompt = {
  ...prompt,
  _id: "pharmacology-prompt",
  key: "section_pharmacology",
  content: "exact pharmacology prompt bytes\n  retained\n",
};
const pharmacologyQuote = {
  ...quote,
  _id: "pharmacology-quote",
  section: "pharmacology",
  content: "exact pharmacology excerpt bytes\n  retained\n",
};
const rawResponse = `summary: "2C-B is a psychedelic phenethylamine known for a distinct balance of sensory alteration, emotional openness, and relatively clear cognition. Its effects vary with dose, setting, individual sensitivity, and route, and careful preparation remains important because responses can differ substantially between people and occasions."`;
const pharmacologyRawResponse = `pharmacology:\n  pharmacodynamics: "2C-B acts as a partial agonist at serotonin 5-HT2 receptors."\n  binding_sites:\n    - target: "5-HT2A"\n      tag: "5-HT2A receptor agonist (partial)"\n  pharmacokinetics: "Available evidence describes hepatic metabolism."\n  metabolites: []\n  route_bioavailability:\n    Oral: "unknown"\n  route_half_life:\n    Oral: "unknown"`;

function findNamedFile(root, name) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      const found = findNamedFile(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

class FakeClient {
  constructor(url) {
    this.url = url;
  }

  async query(reference, args) {
    if (reference === postgresApi.substanceIndex.getBySlug) {
      return this.url.includes("source-") ? sourceArticle : targetArticle;
    }
    if (reference === postgresApi.prompts.getByKey) {
      return args.key === "section_pharmacology" ? pharmacologyPrompt : prompt;
    }
    if (reference === postgresApi.quotes.getBySlugAndSection) {
      return args.section === "pharmacology" ? pharmacologyQuote : quote;
    }
    if (reference === postgresApi.articleSources.getBySlug) return null;
    throw new Error(`Unexpected query: ${reference}`);
  }

  async mutation() {
    throw new Error("Proposal generation must never call mutation().");
  }
}

describe("review-only section proposal orchestration", () => {
  it("writes and verifies the manifest before generation and uses the target baseline", async () => {
    const outputRoot = mkdtempSync(resolve(tmpdir(), "dosewiki-proposal-run-"));
    temporaryDirectories.push(outputRoot);
    let callerObservedManifest = false;

    const result = await generateSectionProposal({
      argv: [
        "--slug=2c-b",
        "--section=summary",
        "--source-url=postgresql://reader:source-secret@localhost/source-test?application_name=proposal-source",
        "--target=postgresql://writer:target-secret@localhost/target-test?application_name=proposal-target",
      ],
      env: { DATA_BACKEND: "postgres",},
      Client: FakeClient,
      postgresApi,
      outputRoot,
      now: () => "2026-07-01T12:00:00.000Z",
      loadsEnvLocal: false,
      callOpenRouter: async () => {
        const manifestPath = findNamedFile(outputRoot, "target-manifest.json");
        callerObservedManifest = Boolean(manifestPath && existsSync(manifestPath));
        return { content: rawResponse, usage: { totalTokens: 50, promptTokens: 40, completionTokens: 10 } };
      },
    });

    expect(callerObservedManifest).toBe(true);
    expect(result.proposal.before.value).toBe(targetArticle.summary);
    expect(result.proposal.before.value).not.toBe(sourceArticle.summary);
    expect(result.proposal.observedChangedTopLevelFields).toEqual(["summary"]);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.deployments.source).toEqual({
      identity: "localhost/source-test",
      urlProvenanceKey: "--source-url",
      fingerprint: "localhost/source-test",
    });
    expect(manifest.deployments.target).toEqual({
      identity: "localhost/target-test",
      urlProvenanceKey: "--target",
      fingerprint: "localhost/target-test",
    });
    const artifacts = [
      result.manifestPath, result.proposalJsonPath, result.proposalMarkdownPath,
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(artifacts).not.toMatch(/source-secret|target-secret|application_name|postgresql:\/\//);
    expect(manifest.prompt.exactContent).toBe(prompt.content);
    expect(manifest.sourceMaterial.excerpts[0].includedContent).toBe(quote.content);
    expect(manifest.targetArticle._id).toBe("target-article");

    const persistedProposal = JSON.parse(readFileSync(result.proposalJsonPath, "utf8"));
    expect(persistedProposal.manifestDigest).toBe(manifest.manifestDigest);
    expect(persistedProposal.slug).toBe("2c-b");
    expect(persistedProposal.baseArticle.slug).toBe("2c-b");
    expect(persistedProposal.proposedArticle.slug).toBe("2c-b");
    expect(persistedProposal.targetDeploymentFingerprint).toBe("localhost/target-test");
    expect(persistedProposal.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedProposal.artifactPaths.manifest).toContain(manifest.manifestDigest);
    expect(persistedProposal.artifactPaths.rawResponse).toContain(manifest.manifestDigest);
    expect(persistedProposal.artifactPaths.markdown).toContain(manifest.manifestDigest);
    expect(readFileSync(result.rawResponsePath, "utf8")).toBe(rawResponse);
    expect(statSync(result.rawResponsePath).mode & 0o777).toBe(0o444);
    expect(statSync(result.proposalJsonPath).mode & 0o777).toBe(0o444);
    expect(statSync(result.proposalMarkdownPath).mode & 0o777).toBe(0o444);
    expect(readFileSync(result.proposalMarkdownPath, "utf8")).toContain(persistedProposal.artifactDigest);
  });

  it("creates a pharmacology-only proposal without carrying route data into dosage or duration", async () => {
    const outputRoot = mkdtempSync(resolve(tmpdir(), "dosewiki-pharmacology-proposal-run-"));
    temporaryDirectories.push(outputRoot);

    const result = await generateSectionProposal({
      argv: [
        "--slug=2c-b",
        "--section=pharmacology",
        "--source-url=postgresql://localhost/source-test",
        "--target=postgresql://localhost/target-test",
      ],
      env: { DATA_BACKEND: "postgres",},
      Client: FakeClient,
      postgresApi,
      outputRoot,
      now: () => "2026-07-02T12:00:00.000Z",
      loadsEnvLocal: false,
      callOpenRouter: async () => ({
        content: pharmacologyRawResponse,
        usage: { totalTokens: 80, promptTokens: 60, completionTokens: 20 },
      }),
    });

    expect(result.proposal.status).toBe("ready_for_review");
    expect(result.proposal.observedChangedTopLevelFields).toEqual(["pharmacology"]);
    expect(result.proposal.guard.allowedTopLevelFields).toEqual(["pharmacology"]);
    expect(result.proposal.baseArticle.dosage).toEqual(result.proposal.proposedArticle.dosage);
    expect(result.proposal.baseArticle.duration).toEqual(result.proposal.proposedArticle.duration);
    expect(result.proposal.expectedOwnedHash).not.toBe(result.proposal.proposedOwnedHash);
    expect(result.proposal.differences.every(({ path }) => path.startsWith("/pharmacology"))).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.prompt.key).toBe("section_pharmacology");
    expect(manifest.prompt.exactContent).toBe(pharmacologyPrompt.content);
    expect(manifest.prompt.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sourceMaterial.record).toEqual(pharmacologyQuote);
    expect(manifest.sourceMaterial.excerpts[0].includedContent).toBe(pharmacologyQuote.content);
    expect(manifest.sourceMaterial.excerpts[0].includedContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.messages.systemHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.messages.userHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.proposal.rawResponseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.proposal.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(result.rawResponsePath, "utf8")).toBe(pharmacologyRawResponse);
  });

  it("fails closed for --write, unknown sections, and missing explicit target", async () => {
    expect(() => parseProposalArgs(["--slug=2c-b", "--section=summary", "--write"])).toThrow(/forbidden/);
    expect(() => parseProposalArgs(["--slug=2c-b", "--section=summary", "--extra=yes"])).toThrow(/Unknown/);

    await expect(generateSectionProposal({
      argv: ["--slug=2c-b", "--section=unknown", "--target=postgresql://localhost/target-test"],
      env: { DATA_BACKEND: "postgres",},
      Client: FakeClient,
      postgresApi,
      loadsEnvLocal: false,
      callOpenRouter: async () => ({ content: rawResponse }),
    })).rejects.toThrow(/Unsupported proposal section/);

    await expect(generateSectionProposal({
      argv: ["--slug=2c-b", "--section=summary", "--source-url=postgresql://localhost/source-test"],
      env: { DATA_BACKEND: "postgres", POSTGRES_DIRECT_URL: "postgresql://localhost/browser-default", POSTGRES_POOLED_URL: "postgresql://localhost/browser" },
      Client: FakeClient,
      postgresApi,
      loadsEnvLocal: false,
      callOpenRouter: async () => ({ content: rawResponse }),
    })).rejects.toThrow(/explicit proposal target/);

    class WrongTargetArticleClient extends FakeClient {
      async query(reference, args) {
        const result = await super.query(reference, args);
        if (reference === postgresApi.substanceIndex.getBySlug && !this.url.includes("source-")) {
          return { ...result, slug: "lsd" };
        }
        return result;
      }
    }

    await expect(generateSectionProposal({
      argv: [
        "--slug=2c-b",
        "--section=summary",
        "--source-url=postgresql://localhost/source-test",
        "--target=postgresql://localhost/target-test",
      ],
      env: { DATA_BACKEND: "postgres",},
      Client: WrongTargetArticleClient,
      postgresApi,
      loadsEnvLocal: false,
      callOpenRouter: async () => ({ content: rawResponse }),
    })).rejects.toThrow(/Target article identity mismatch/);
  });
});
