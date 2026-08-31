# DoseWiki Public API handoff

This is the implementation handoff for consuming everything currently exposed by the read-only DoseWiki Public API: substance listings, complete substance articles, normalized reagent-test results, molecule SVGs, and image/video effect replications.

## Start here

```text
Production base URL: https://dose.wiki/api/v1
OpenAPI 3.1:       https://dose.wiki/api/v1/openapi.json
Metadata:          https://dose.wiki/api/v1/meta
```

The API is live on the public dose.wiki origin. API paths are versioned under `/api/v1`; do not build against unversioned or `/dev` routes.

The API is public and read-only:

- no API key or authentication is required;
- browser requests are supported with `Access-Control-Allow-Origin: *`;
- supported methods are `GET`, `HEAD`, and `OPTIONS`;
- JSON and SVG responses are cached; clients should still cache responsibly;
- reads are rate-limited, so honor `429` responses and retry with backoff;
- substance and replication list cursors are opaque—store and return them unchanged;
- content is for harm-reduction education and is not medical advice.

License and reuse terms: <https://dose.wiki/docs/license>. Substance article data and replication media do not necessarily have the same reuse rights. Preserve article source attribution, and inspect each replication's `rights` object before reuse.

## Endpoint inventory

| Method | Path                               | Purpose                                                               |
| ------ | ---------------------------------- | --------------------------------------------------------------------- |
| `GET`  | `/meta`                            | API version, documentation, license, and disclaimer                   |
| `GET`  | `/substances`                      | Cursor-paginated public substance previews                            |
| `GET`  | `/substances/{slug}`               | Complete public substance article plus reagent and molecule resources |
| `GET`  | `/substances/{slug}/reagent-tests` | Standalone normalized reagent-test results                            |
| `GET`  | `/replications`                    | Cursor-paginated image/video replication gallery                      |
| `GET`  | `/replications/{slug}`             | One replication and its rights metadata                               |
| `GET`  | `/effects/{slug}/replications`     | All replications associated with one subjective-effect slug           |
| `GET`  | `/molecules/{slug}.svg`            | Sandboxed molecule SVG in either visual scheme                        |
| `GET`  | `/openapi.json`                    | Machine-readable OpenAPI 3.1 contract                                 |

Substance and effect slugs use lowercase letters, numbers, and hyphens, for example `mdma` or `2c-b`.

## Recommended integration flow

1. Page through `/substances` to create or refresh a local index.
2. Fetch `/substances/{slug}` only when the full article is needed.
3. Use `reagent_testing_normalized` from the article response, or the standalone reagent endpoint when reagent data is the only requirement.
4. Use the molecule URLs supplied in `data.molecule.schemes`; do not construct legacy asset paths.
5. Page through `/replications`, optionally filtering by effect and media type. Preserve each item's credit and rights metadata beside the media.
6. Refresh cached content periodically rather than scraping public HTML pages.

## Quick client example

```ts
const API_BASE_URL = "https://dose.wiki/api/v1";

export async function getSubstance(slug: string) {
  const response = await fetch(
    `${API_BASE_URL}/substances/${encodeURIComponent(slug)}`,
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message ?? `DoseWiki API returned ${response.status}`,
    );
  }

  const { data } = await response.json();
  return data;
}
```

Do not hard-code an exhaustive client type from examples in this document. Generate types from `/openapi.json` where practical, tolerate additive fields, and treat the runtime response as authoritative.

## Pagination

`/substances` and `/replications` accept:

- `limit`: integer from `1` through `100`; default `25`;
- `cursor`: opaque value returned as `pagination.next_cursor`.

A page has this envelope:

```json
{
  "data": [],
  "pagination": {
    "limit": 25,
    "next_cursor": "eyJvZmZzZXQiOjI1fQ",
    "has_more": true
  },
  "meta": {
    "api_version": "v1",
    "total": 248
  }
}
```

Continue while `has_more` is true. Pass `next_cursor` back without decoding or modifying it.

```ts
export async function getAllPages<T>(path: string): Promise<T[]> {
  const values: T[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${API_BASE_URL}${path}`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`DoseWiki API returned ${response.status}`);

    const page = await response.json();
    values.push(...page.data);
    cursor = page.pagination.has_more ? page.pagination.next_cursor : null;
  } while (cursor);

  return values;
}
```

## Substance listing

```http
GET /substances?limit=100&cursor=...
```

Each preview contains:

```ts
type SubstancePreview = {
  slug: string;
  title: string;
  summary: string;
  priority: string | null;
  categories: string[];
  url: string;
};
```

`categories` is the public projection of the article's index categories. `url` points to the live public article.

## Complete substance article

```http
GET /substances/mdma
```

Response envelope:

```json
{
  "data": { "slug": "mdma", "title": "MDMA" },
  "meta": { "api_version": "v1" }
}
```

The response is a public-safe projection of the canonical article. Editor-only review metadata is removed. It includes all of these top-level content surfaces:

- identity/index fields: `slug`, `id`, `title`, `priority`, `index_categories`, `summary`;
- article sections: `identification`, `classification`, `dosage`, `duration`, `subjective_effects`, `comparisons`, `pharmacology`, `interactions`, `reagent_testing`, `tolerance`, `harm_potential`, `history_culture`, and `legality`;
- provenance: `references`, `source_citations`, and `citations`;
- API enrichments: `reagent_testing_normalized`, `molecule`, and `url`.

Some fields are optional, nullable, empty, or retained in a legacy-compatible shape. Render defensively.

### `identification`

```ts
{
  common_name: string;
  substitutive_name: string;
  iupac_name: string;
  alternative_names: string[];
  smiles: string;
  inchi_key: string;
  cas_number: string;
  molecular_formula: string;
  molecular_weight: string;
  skeletal_structure_image: string;
  botanical_name: string | null;
}
```

Prefer `molecule.schemes` for depiction URLs. The identification fields remain useful for labels, search, chemistry metadata, and external matching.

### `classification`

```ts
{
  psychoactive_class: string[];
  chemical_class: string[];
}
```

### `summary`

A Markdown-capable article summary string. Citation markers may appear in prose as `[cite:reference-id]`; resolve them against `references` when building a custom renderer.

### `dosage`

```ts
{
  routes: Array<{
    route: string;
    bioavailability: string;
    bioavailability_notes: string;
    dose_ranges: {
      threshold: Range;
      light: Range;
      moderate: Range;
      strong: Range;
      heavy: Range;
    };
    notes: string;
    reference_ids?: string[];
  }>;
  plateau_dosing: null | {
    first_plateau: Plateau;
    second_plateau: Plateau;
    third_plateau: Plateau;
    fourth_plateau: Plateau;
    fifth_plateau: Plateau | null;
    notes: string | null;
  };
}

type Range = { min: number | null; max: number | null; unit: string };
type Plateau = Range & { effects: string };
```

Values are descriptive harm-reduction content, not personalized dosing advice. Do not infer missing bounds.

### `duration`

```ts
{
  routes: Array<{
    route: string;
    half_life: string;
    half_life_notes: string;
    stages: {
      onset: DurationRange;
      come_up: DurationRange;
      peak: DurationRange;
      offset: DurationRange;
      after_effects: DurationRange;
      total_duration: DurationRange;
    };
    reference_ids?: string[];
  }>;
}

type DurationRange = { min: number | null; max: number | null; unit: string };
```

### `subjective_effects`

```ts
{
  notes: {
    overview: string;
    sensory: string;
    cognitive: string;
    physical: string;
  };
  sensory: {
    visual: SenseCategory;
    auditory: SenseCategory;
    tactile: SenseCategory;
    olfactory: SenseCategory;
    gustatory: SenseCategory;
    multisensory: SenseCategory;
  };
  cognitive: EffectCategory;
  physical: EffectCategory;
  progressive_stages?: EffectCategory | null;
  attribution?: { author: string; text: string; url: string } | null;
  is_stub?: boolean;
  source_overview?: string;
}

type EffectEntry = { name: string; description: string };
type EffectSubcategory = { note: string; effects: EffectEntry[] };
type EffectCategory = Record<string, EffectSubcategory>;
type SenseCategory = { note: string; subcategories: EffectCategory };
```

Category keys are data, not a fixed enum. Preserve the provided labels and attribution.

### `comparisons`

```ts
Array<{ drug: string; comparison: string }>;
```

### `pharmacology`

```ts
{
  pharmacodynamics: string;
  summary?: string;
  binding_sites: Array<{
    target: string;
    tag?: string;
    affinity?: string;
    efficacy?: string;
  }>;
  receptor_profile: Array<{
    receptor: string;
    tag?: string;
    affinity?: string;
    efficacy?: string;
  }>;
  pharmacokinetics: string;
  metabolites: string[];
  protein_binding?: string | null;
  volume_of_distribution?: string | null;
  route_bioavailability?: Record<string, string>;
  route_half_life?: Record<string, string>;
  route_half_life_notes?: Record<string, string>;
  route_bioavailability_notes?: Record<string, string>;
  bioavailability_notes?: string;
  half_life?: string;
}
```

`receptor_profile` is the API-normalized alias of `binding_sites`, with `target` renamed to `receptor`. Prefer it for new consumers while tolerating both fields.

### `interactions`

```ts
{
  dangerous: string[];
  unsafe: string[];
  caution: string[];
}
```

These are categorical content entries, not a complete interaction checker or clinical decision system.

### `reagent_testing`

The authored article field is a reagent-key-to-description record:

```ts
Record<string, string>;
```

For integrations, prefer `reagent_testing_normalized`, documented under [Reagent tests](#reagent-tests).

### `tolerance`

```ts
{
  full_tolerance: string;
  half_tolerance: string;
  baseline_tolerance: string;
  cross_tolerance: string[];
}
```

### `harm_potential`

This section supports both structured current fields and legacy additive fields. Known structured fields include:

```ts
{
  addiction?: {
    psychological?: Risk;
    physical_dependence?: Risk;
  };
  toxicity?: {
    lethal_dosage?: {
      ld50?: Array<{ species: string; route: string; value: number | null; unit: string }>;
      notes?: string;
    };
    ld50?: Array<{ species: string; route: string; value: number | null; unit: string }> | string;
    organ_toxicity?: Array<{
      system: string;
      findings: string;
      mechanism: string;
      notes: string;
    }> | string;
    carcinogenicity?: object | string;
    antibiotic_function?: object | string;
    other?: string;
  };
  psychosis?: Risk;
  seizure?: Risk;
  [legacyField: string]: unknown;
}

type Risk = {
  level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null;
  description: string;
  [legacyField: string]: unknown;
};
```

Do not discard unknown fields: this section intentionally accepts legacy-compatible additions.

### `history_culture`

May be `null` or absent.

```ts
{
  content: string;
  sections: Array<{
    heading: string;
    content: string;
    date_range?: { start: string; end?: string };
    subsections?: Array<{
      heading: string;
      content: string;
      date_range?: { start: string; end?: string };
    }>;
  }>;
}
```

### `legality`

```ts
{
  international: string[];
  countries: Record<string, LegalityEntry>;
  usStates?: Record<string, LegalityEntry & {
    cities?: Record<string, LegalityEntry>;
  }>;
  usStatesNote?: string;
}

type LegalityEntry = {
  status: string;
  notes: string;
  canonicalStatus?:
    | "prohibited"
    | "analog_covered"
    | "precursor_controlled"
    | "prescription_only"
    | "decriminalized"
    | "legal_regulated"
    | "unscheduled"
    | "restricted_other";
  instrument?: string;
  designation?: string;
  citationNeeded?: boolean;
};
```

Legality changes over time and by jurisdiction. Display the supplied notes and citations; do not reduce the section to a single universal legal/illegal flag.

### References and citations

`references` contains structured, Wikipedia-style references. Common fields include `id`, `type`, `template`, `title`, `authors`, dates, publication/container metadata, DOI/PMID/ISBN/URL identifiers, source type, quality, access, and support status.

`source_citations` and `citations`, when present, contain simple link entries:

```ts
{
  name: string;
  url: string;
}
```

Article prose can contain `[cite:<id>]` markers that refer to `references[].id`. Preserve those links and attribution when republishing. Treat optional reference fields as nullable.

## Reagent tests

Standalone request:

```http
GET /substances/mdma/reagent-tests
```

The same object is included in a complete article as `reagent_testing_normalized`.

```ts
type ReagentTesting = {
  source: "authored" | "protestkit_snapshot" | "none";
  substance: null | {
    name: string;
    aliases: string[];
  };
  results: Array<{
    reagent: string;
    label?: string;
    description: string;
    hint?: string;
    isReacting?: boolean;
    colors?: Array<{
      id: number;
      name: string;
      hex: string;
    }>;
  }>;
};
```

Source behavior:

- `authored`: DoseWiki's authored reagent descriptions take precedence. These rows may contain only `reagent` and `description`.
- `protestkit_snapshot`: normalized results come from DoseWiki's point-in-time ProtestKit snapshot and can include labels, reaction state, hints, and colors.
- `none`: no results are available; `results` is empty.

Reagent reactions are presumptive identification aids, not proof of identity, purity, dose, or safety. Keep that limitation visible in any consuming product. Do not silently convert `none` into a negative test result.

## Molecules

A complete article supplies both depiction resources:

```json
{
  "molecule": {
    "chemical_identifiers": {
      "smiles": "...",
      "inchi_key": "...",
      "formula": "..."
    },
    "schemes": {
      "dosewiki": { "url": "/api/v1/molecules/mdma.svg?scheme=dosewiki" },
      "effect-index": {
        "url": "/api/v1/molecules/mdma.svg?scheme=effect-index"
      }
    }
  }
}
```

Direct request:

```http
GET /molecules/mdma.svg?scheme=dosewiki
GET /molecules/mdma.svg?scheme=effect-index
```

The response is `image/svg+xml`, not JSON, and carries a sandbox Content Security Policy. `scheme` defaults to `dosewiki`. Resolve relative URLs against the deployment origin:

```ts
const absoluteMoleculeUrl = new URL(
  article.molecule.schemes.dosewiki.url,
  "https://dose.wiki",
).toString();
```

A depiction may come from the canonical Convex override or a static publication fallback. A missing depiction returns `404`; chemical identifiers may still be present in the article.

## Effect replications

Replications are image/video attempts to reproduce subjective effects. They are separate media records, not embedded in substance article responses.

### Browse all replications

```http
GET /replications?limit=100
GET /replications?effect=drifting&type=video&limit=25
```

Optional filters:

- `effect`: exact effect slug;
- `type`: `image` or `video`.

Filtering happens before pagination. Results are ordered by effect slug, curated within-effect order when available, then replication slug.

### Browse one effect

```http
GET /effects/drifting/replications
```

This endpoint returns all matching items without a pagination object. Metadata includes `effect_slug` and `total`. An empty array means there are no associated replications; it is not necessarily an error or proof that an effect article exists.

### Fetch one replication

```http
GET /replications/example-replication-slug
```

Replication shape:

```ts
type Replication = {
  slug: string;
  title: string;
  artist: string;
  artist_url?: string;
  type: "image" | "video";
  effect_slug: string;
  url: string;
  thumbnail_url?: string;
  preview_url?: string;
  width?: number;
  height?: number;
  format: string;
  file_size?: number;
  duration?: number;
  order_index?: number;
  rights: {
    status: string;
    license_name?: string;
    license_url?: string;
    credit_line?: string;
    source_url?: string;
    rightsholder?: string;
  };
};
```

`url`, `thumbnail_url`, and `preview_url` are storage URLs and may be time-sensitive. Refresh the API record before display instead of persisting those URLs as permanent identifiers; video preview renditions may receive a new URL when regenerated. Never infer permission from public availability. If `rights.status` is `unknown`, treat reuse rights as unknown. Keep `artist`, `credit_line`, and applicable source/license links with the media.

## Errors and retries

JSON errors use this shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "Substance not found."
  },
  "meta": {
    "api_version": "v1"
  }
}
```

Known error codes are:

- `invalid_request`: malformed slug, filter, limit, or molecule scheme;
- `invalid_cursor`: malformed or out-of-range cursor;
- `not_found`: requested substance, replication, or molecule does not exist;
- `service_unavailable`: an upstream/runtime read failed.

Handle status codes as follows:

| Status | Meaning                   | Client action                           |
| ------ | ------------------------- | --------------------------------------- |
| `200`  | Success                   | Consume according to `Content-Type`     |
| `204`  | Successful CORS preflight | No body                                 |
| `400`  | Invalid request/cursor    | Fix the request; do not retry unchanged |
| `404`  | Resource not found        | Treat as absent or refresh your index   |
| `429`  | Rate limited              | Back off with jitter and retry later    |
| `503`  | Temporary data failure    | Retry with bounded exponential backoff  |

Do not assume every error response is JSON (infrastructure-generated `429` or gateway errors can differ). Check `response.ok` and `Content-Type` before parsing.

## Caching and synchronization

Successful responses currently advertise browser/shared-cache directives. Consumers should:

- respect response cache headers rather than polling continuously;
- use list endpoints as the discovery source instead of guessing slugs;
- perform idempotent upserts keyed by `slug`;
- replace records on refresh while tolerating newly added fields;
- avoid persisting replication storage URLs as permanent identifiers;
- key API behavior to the `v1` URL and `meta.api_version`, not to undocumented implementation details.

There are no API webhooks, delta feeds, write endpoints, or guaranteed `ETag` workflow in the current public contract.

## What is not exposed yet

The public website contains more Convex-backed surfaces than API v1 currently exposes. In particular, API v1 does **not** currently provide:

- standalone subjective-effect article bodies or an effect index (only effect-linked replications);
- trip reports or trip-report listings;
- category, chemical-class, mechanism, contributor, or site-configuration indexes;
- audio replications;
- editor metadata, citation evidence, drafts, queues, or moderation data;
- molecule MOL blocks or molecule editing operations;
- writes of any kind.

Do not call similarly named `/api/dev/*`, `/api/reagent-proxy`, `/api/molecules/*`, save, submission, feedback, or queue routes from a public integration. They are protected/internal, have different contracts, or are not stable public API surfaces.

## Source-of-truth pointers for maintainers

When the API changes, update this handoff alongside the implementation:

- public API projection, envelopes, CORS, caching, and cursor rules: `lib/public-api/v1.ts`;
- route handlers: `src/app/api/v1/`;
- machine-readable contract: `src/app/api/v1/openapi.json/route.ts`;
- canonical substance article schema: `src/schema/substance.schema.ts` and `src/schema/substance/`;
- replication public type: `src/types/replications.ts`;
- normalized reagent types: `src/types/reagent.ts`.

The OpenAPI document is the machine entrypoint, but its nested article-section schemas are intentionally permissive. The canonical section files above remain the detailed implementation reference until the OpenAPI schemas become fully explicit.
