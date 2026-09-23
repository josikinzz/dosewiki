import { evaluateReleaseEvidence } from "../../scripts/translation/release-evidence.mjs";
import type { TranslationCoverageResponse } from "./translationCoverageTypes";
export type RenderedCoverageEvidence = {
    locale: string;
    checkedAt: string;
    expectedDigest: string;
    pages: Array<{
        path: string;
        url?: string;
        status?: number;
        observedDigest?: string | null;
        checks?: Array<{
            id: string;
            passed: boolean;
        }>;
        failures?: string[];
    }>;
};
/** Imported browser observations are dated samples, never a claim about the whole site. */
export function parseRenderedCoverageEvidence(value: unknown): RenderedCoverageEvidence {
    const v = value as RenderedCoverageEvidence | null;
    if (!v || typeof v.locale !== "string" || typeof v.expectedDigest !== "string" || !v.expectedDigest ||
        typeof v.checkedAt !== "string" || !Number.isFinite(Date.parse(v.checkedAt)) || !Array.isArray(v.pages) || v.pages.length > 100) {
        throw new Error("Choose a release-check JSON report with a locale, timestamp, catalog digest, and at most 100 pages.");
    }
    const paths = new Set<string>();
    for (const page of v.pages) {
        if (!page || typeof page.path !== "string" || !page.path.startsWith("/") || page.path.startsWith("//") || paths.has(page.path) ||
            (page.checks !== undefined && (!Array.isArray(page.checks) || page.checks.some((c) => !c || typeof c.id !== "string" || typeof c.passed !== "boolean")))) {
            throw new Error("Release evidence contains invalid or duplicate route observations.");
        }
        if (page.url !== undefined) {
            if (typeof page.url !== "string") throw new Error("Invalid observed URL.");
            const url = new URL(page.url);
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use observed HTTP(S) URLs without credentials.");
        }
        paths.add(page.path);
    }
    return v;
}
export function combineTranslationCoverage(source: TranslationCoverageResponse, evidence: RenderedCoverageEvidence | null, expectedRoutes: readonly string[], catalogDigest: string | null) {
    if (evidence && evidence.locale !== source.locale)
        throw new Error("The release evidence belongs to a different locale.");
    const routes = [...new Set([...expectedRoutes, ...(evidence?.pages.map((p) => p.path) ?? [])])].map((path) => {
        const page = evidence?.pages.find((p) => p.path === path);
        const artifactMatches = Boolean(catalogDigest && evidence?.expectedDigest === catalogDigest && page?.observedDigest === catalogDigest);
        return { path, url: page?.url ?? null, status: !page ? "unverified" : artifactMatches && Boolean(page.url) && evaluateReleaseEvidence({expectedDigest: catalogDigest, observedDigest: page.observedDigest, status: page.status, checks: page.checks ?? []}).verified ? "verified" : "failed", observation: page ?? null };
    });
    return {
        source,
        rendered: { checkedAt: evidence?.checkedAt ?? null, routes, sampled: evidence?.pages.length ?? 0, expected: expectedRoutes.length,
            scope: "Imported, point-in-time route samples only. Other routes and interactive states remain unverified." },
        // A combined coverage report cannot certify linguistic quality or human review.
        releaseReady: false as const,
        releaseMessage: "Coverage is evidence for a release decision, not human approval or a corpus-wide quality certificate.",
    };
}
