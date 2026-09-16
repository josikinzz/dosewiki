import Link from "next/link";

import { buildPageMetadata } from "@server/next/metadata";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { Icon } from "@/components/common/Icon";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { ContentCard, NestedContentCard } from "@/components/ui/surface";

export async function generateMetadata() {
  const copy = await getCopyByKeys(["seo-api-v1-description"]);

  return buildPageMetadata({
    title: "Public API",
    description:
      copy.text("seo-api-v1-description") ||
      "Documentation and examples for the read-only dose.wiki substance API.",
    pathname: "/api/v1",
  });
}

const endpoints = [
  {
    method: "GET",
    path: "/api/v1/meta",
    description: "API version, documentation, licensing, and disclaimer metadata.",
  },
  {
    method: "GET",
    path: "/api/v1/substances",
    description:
      "A cursor-paginated collection of public substance summaries. Supports limit and cursor parameters.",
  },
  {
    method: "GET",
    path: "/api/v1/substances/{slug}",
    description: "The complete article, citations, normalized reagent results, and molecule resources.",
  },
  {
    method: "GET",
    path: "/api/v1/substances/{slug}/reagent-tests",
    description: "Normalized authored or point-in-time ProtestKit reagent results with provenance.",
  },
  {
    method: "GET",
    path: "/api/v1/substances/{slug}/replications",
    description: "The canonical substance article replication collection with cursor paging, public association context, and media rights.",
  },
  {
    method: "GET",
    path: "/api/v1/replications",
    description: "Cursor-paginated public image and video replications. Filter by effect or media type.",
  },
  {
    method: "GET",
    path: "/api/v1/replications/{slug}",
    description: "One replication with public attribution, rights, and media metadata.",
  },
  {
    method: "GET",
    path: "/api/v1/effects/{slug}/replications",
    description: "All image and video replications associated with one subjective effect.",
  },
  {
    method: "GET",
    path: "/api/v1/molecules/{slug}.svg?scheme=dosewiki",
    description: "A sandboxed molecule SVG in the dose.wiki, Effect Index light, or Effect Index dark color scheme.",
  },
  {
    method: "GET",
    path: "/api/v1/openapi.json",
    description: "The machine-readable OpenAPI 3.1 specification.",
  },
] as const;

const fetchExample = `const response = await fetch(
  "https://dose.wiki/api/v1/substances/mdma"
);

if (!response.ok) throw new Error(\`DoseWiki API: \${response.status}\`);

const { data, meta } = await response.json();
console.log(data.title, data.slug, meta.api_version);`;

export default function PublicApiPage() {
  return (
    <PublicContentShell focusTarget width="standard" className="space-y-8">
      <header className="max-w-3xl space-y-4 border-b border-dose-divider pb-8">
        <p className="theme-text-faint text-xs font-semibold uppercase tracking-[0.18em]">
          Read-only public interface · v1 beta
        </p>
        <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
          DoseWiki Public API
        </h1>
        <p className="theme-text-secondary max-w-[68ch] text-[1.0625rem] leading-7">
          Use the live DoseWiki substance database in websites, research tools,
          and harm-reduction resources. The API returns stable, public-safe JSON
          projections and never exposes editor-only metadata.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild variant="default">
            <Link href="/api/v1/openapi.json">
              <Icon icon="lucide:file-json-2" size={16} aria-hidden="true" />
              OpenAPI specification
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api/v1/substances?limit=5">
              <Icon icon="lucide:database" size={16} aria-hidden="true" />
              View sample response
            </Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="quick-start" className="space-y-4">
        <h2
          id="quick-start"
          className="theme-accent-heading font-display text-2xl font-semibold"
        >
          Quick start
        </h2>
        <ContentCard>
          <p className="theme-text-secondary leading-7">
            Requests are anonymous and require no API key. Send a standard HTTP
            GET request from a server or browser. Cross-origin requests are
            supported with wildcard CORS.
          </p>
          <pre className="theme-text-secondary mt-5 overflow-x-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[13px] leading-6">
            <code>{fetchExample}</code>
          </pre>
        </ContentCard>
      </section>

      <section aria-labelledby="endpoints" className="space-y-4">
        <h2
          id="endpoints"
          className="theme-accent-heading font-display text-2xl font-semibold"
        >
          Endpoints
        </h2>
        <div className="space-y-3">
          {endpoints.map((endpoint) => (
            <NestedContentCard key={endpoint.path} className="sm:grid sm:grid-cols-[minmax(0,18rem)_1fr] sm:gap-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="theme-badge-surface shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-dose-accent-strong">
                  {endpoint.method}
                </span>
                <code className="theme-text-primary min-w-0 break-all font-mono text-sm font-semibold leading-6">
                  {endpoint.path}
                </code>
              </div>
              <p className="theme-text-muted mt-3 text-sm leading-6 sm:mt-0">
                {endpoint.description}
              </p>
            </NestedContentCard>
          ))}
        </div>
      </section>

      <section aria-labelledby="data-model" className="space-y-4">
        <h2 id="data-model" className="theme-accent-heading font-display text-2xl font-semibold">
          Data model and provenance
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ContentCard>
            <h3 className="theme-accent-heading font-display text-xl font-semibold">Articles and citations</h3>
            <p className="theme-text-secondary mt-4 text-sm leading-6">
              Substance detail includes every public canonical article section, structured references,
              source citations, supporting citations, and both canonical pharmacology binding sites and
              the backwards-compatible receptor profile. Citation evidence and editorial review metadata
              remain private.
            </p>
          </ContentCard>
          <ContentCard>
            <h3 className="theme-accent-heading font-display text-xl font-semibold">Reagent results</h3>
            <p className="theme-text-secondary mt-4 text-sm leading-6">
              Authored article results take precedence. Otherwise the API returns the imported ProtestKit
              snapshot and labels its source. A source of <code>none</code> is an explicit no-result state,
              not permission to query ProtestKit live.
            </p>
          </ContentCard>
          <ContentCard>
            <h3 className="theme-accent-heading font-display text-xl font-semibold">Molecule schemes</h3>
            <p className="theme-text-secondary mt-4 text-sm leading-6">
              Request <code>scheme=dosewiki</code>, <code>scheme=effect-index</code>, or{" "}
              <code>scheme=effect-index-dark</code>. Canonical editor depictions are preferred,
              with the packaged static SVG collections as a resilient fallback.
            </p>
          </ContentCard>
          <ContentCard>
            <h3 className="theme-accent-heading font-display text-xl font-semibold">Replication rights</h3>
            <p className="theme-text-secondary mt-4 text-sm leading-6">
              Replication media has item-specific rights and is not automatically covered by the article
              dataset license. Check each item&apos;s rights, license, credit, source, and rightsholder fields
              before reuse.
            </p>
          </ContentCard>
        </div>
      </section>

      <section aria-labelledby="usage" className="grid gap-4 md:grid-cols-2">
        <ContentCard>
          <h2
            id="usage"
            className="theme-accent-heading font-display text-xl font-semibold"
          >
            Usage limits
          </h2>
          <ul className="theme-text-secondary mt-4 space-y-2 text-sm leading-6 marker:text-dose-accent-muted">
            <li>Default page size: 25 substances</li>
            <li>Maximum page size: 100 substances</li>
            <li>Rate limit: 120 requests per minute per IP</li>
            <li>Responses are cached at the CDN for five minutes</li>
          </ul>
        </ContentCard>

        <ContentCard>
          <h2 className="theme-accent-heading font-display text-xl font-semibold">
            Reuse and safety
          </h2>
          <p className="theme-text-secondary mt-4 text-sm leading-6">
            DoseWiki content is provided for harm-reduction education and is not
            medical advice. Check the licensing page before republishing content
            or media outside the core article dataset.
          </p>
          <Button asChild variant="link" className="mt-3 px-0">
            <Link href="/docs/license">Read licensing and reuse terms</Link>
          </Button>
        </ContentCard>
      </section>

      <p className="theme-text-faint border-t border-dose-divider pt-6 text-sm leading-6">
        This unlisted page is intentionally absent from site navigation. The API is beta:
        versioned v1 response fields remain stable, additive fields may appear, and write operations
        are not exposed.
      </p>
    </PublicContentShell>
  );
}
