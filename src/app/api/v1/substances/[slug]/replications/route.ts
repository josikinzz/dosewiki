import { NextResponse } from "next/server";
import {
  getPublicContributorProfiles,
  getPublicEffectBySlug,
  getPublicReplicationsForSubstance,
  getPublicSubstanceBySlug,
} from "@server/convex/publicData";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import {
  applyPublicApiCors,
  getPublicApiCorsHeaders,
  getPublicApiResponseHeaders,
} from "@server/public-api/v1";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import { resolveEffectCategories } from "@/features/effects/pages/replicationSubject";
import { isPublishableReplication } from "@/types/replications";
import { publicHref } from "@/utils/publicHref";
import type { ReplicationViewerItem } from "@/features/replications/viewer/viewerModel";

/**
 * The replication viewer's substance walk: the same ordered gallery the
 * article's Replication Showcase renders, reshaped into viewer items. A
 * reader who entered the viewer from a substance article's showcase walks
 * *that substance's* works, not the active work's whole effect — the viewer
 * fetches this after hydration (the permalink page is server-rendered with
 * the effect walk it can compute without knowing where the reader came from)
 * and swaps its set when the active slug is a member.
 *
 * The body is the viewer's set contract — `{ scope, scopeLabel, items }`,
 * items shaped exactly like the permalink page's server props — rather than
 * the public API's `data`/`meta` envelope: the only consumer is our own
 * viewer client, and mirroring its prop shape means the swap is a state
 * replacement with no re-projection. Rate limiting and cache headers do
 * follow the sibling v1 routes; the viewer treats any non-OK answer as
 * "keep the server-provided set", so a limited or failing read degrades to
 * exactly the page the reader already has.
 */

export const runtime = "nodejs";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getPublicApiCorsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = await enforceRateLimit(request, "publicContentApiRead");
  if (rateLimited) return applyPublicApiCors(rateLimited);
  const { slug } = await params;
  // `{ error: "not-found" }` is one answer for "there is no substance walk
  // here": unknown substance, malformed slug, and a substance whose gallery
  // is empty all look identical to the viewer, which simply keeps the set it
  // was served with.
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "not-found" },
      { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }

  try {
    const [gallery, substance] = await Promise.all([
      getPublicReplicationsForSubstance(slug),
      // Read the article only for its display name: the scope label under the
      // viewer's filmstrip should say "LSD", not "lsd".
      getPublicSubstanceBySlug(slug),
    ]);

    // The read already applies the publishability gate; the URL check repeats
    // the permalink loader's defence against a storage id that resolved to
    // nothing, so the viewer is never handed a slide it cannot draw.
    const rows = gallery.items.filter(
      (item) => item.replication.url && isPublishableReplication(item.replication),
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "not-found" },
        { status: 404, headers: getPublicApiResponseHeaders({ cache: false }) },
      );
    }

    // Each slide's caption names the work's *own* effect — the same breadcrumb
    // the permalink page server-renders — so swapping the walk from effect to
    // substance scope never rewrites the caption under the reader's cursor. A
    // row with no real effect of its own falls back to the substance-derived
    // effect that matched it here (`provenance.effectSlug`), which is at least
    // true of the work rather than blank.
    const captionEffectSlugOf = (row: (typeof rows)[number]) =>
      // Rows carry `effect_slug: "unknown"` when nothing real is attached.
      row.replication.effect_slug && row.replication.effect_slug !== "unknown"
        ? row.replication.effect_slug
        : row.provenance.effectSlug;

    const distinctEffectSlugs = [...new Set(rows.map(captionEffectSlugOf))];
    // Only a credit that names a person can resolve to a profile; a gallery of
    // unattributed works skips the read rather than paying for a lookup that
    // cannot succeed — same reasoning as the permalink loader.
    const anyKnownCreator = rows.some((item) => hasKnownCreator(item.replication.artist));
    const [effectEntries, contributorProfiles] = await Promise.all([
      Promise.all(
        distinctEffectSlugs.map(async (effectSlug) =>
          [effectSlug, await getPublicEffectBySlug(effectSlug)] as const,
        ),
      ),
      anyKnownCreator ? getPublicContributorProfiles() : Promise.resolve([]),
    ]);
    const effectBySlug = new Map(effectEntries);

    const items: ReplicationViewerItem[] = rows.map((row) => {
      const effectSlug = captionEffectSlugOf(row);
      const effect = effectSlug ? effectBySlug.get(effectSlug) : null;
      const creator = hasKnownCreator(row.replication.artist)
        ? row.replication.artist.trim()
        : null;
      const profile = creator
        ? findContributorProfileByAuthorName(contributorProfiles, creator)
        : null;
      return {
        replication: row.replication,
        effectName: effect?.name ?? null,
        effectSlug: effectSlug ?? null,
        effectCategories: effect ? resolveEffectCategories(effect.tags) : [],
        artistProfileHref: profile ? publicHref.contributor(profile.key) : null,
      };
    });

    return NextResponse.json(
      {
        scope: "substance" as const,
        scopeLabel: substance?.title ?? slug,
        items,
      },
      { headers: getPublicApiResponseHeaders() },
    );
  } catch (error) {
    console.error(`Failed to read the substance replication viewer set for ${slug}:`, error);
    // Distinct from 404 on purpose: "unavailable" must not teach the viewer
    // (or a cache) that this substance has no walk.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: getPublicApiResponseHeaders({ cache: false }) },
    );
  }
}
