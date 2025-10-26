import { useMemo } from "react";
import { Scale, Timer } from "lucide-react";

import type { SubstanceRecord } from "../../data/contentBuilder";
import type { RouteInfo, RouteKey } from "../../types/content";
import { viewToHash } from "../../utils/routing";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";

interface SocialPreviewPageProps {
  slug: string;
  record?: SubstanceRecord;
}

const MAX_CATEGORY_CHIPS = 6;

const formatCategoryLabel = (value: string): string =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const resolvePrimaryRoute = (routes: Record<RouteKey, RouteInfo>, order: RouteKey[]): RouteInfo | undefined => {
  for (const key of order) {
    if (routes[key]) {
      return routes[key];
    }
  }

  const firstKey = Object.keys(routes)[0] as RouteKey | undefined;
  return firstKey ? routes[firstKey] : undefined;
};

const buildShareUrl = (shareHash: string): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://dose.wiki";
  return `${origin}${shareHash}`;
};

export function SocialPreviewPage({ slug, record }: SocialPreviewPageProps) {
  if (!record) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
          <p className="text-lg font-semibold text-white">No matching substance found.</p>
          <p className="mt-3 text-sm text-white/70">The slug "{slug}" did not match any article.</p>
        </div>
      </div>
    );
  }

  const { content } = record;
  const primaryRoute = resolvePrimaryRoute(content.routes, content.routeOrder);
  const categories = (record.categories?.length ? record.categories : content.categories ?? []).slice(
    0,
    MAX_CATEGORY_CHIPS,
  );
  const shareHash = viewToHash({ type: "substance", slug: record.slug });
  const shareUrl = useMemo(() => buildShareUrl(shareHash), [shareHash]);
  const previewImageSrc = content.moleculeAsset?.url ?? logoDataUri;
  const previewImageAlt = content.moleculeAsset
    ? `${record.name} molecule illustration`
    : "dose.wiki wordmark";

  const dosageEntries = primaryRoute?.dosage ?? [];
  const durationEntries = primaryRoute?.duration ?? [];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[980px] flex-col items-center gap-6">
        <div className="w-full rounded-[32px] border border-white/10 bg-gradient-to-br from-[#201737]/95 via-[#160f2b]/95 to-[#0f0a1f]/95 p-8 text-left shadow-[0_30px_80px_rgba(5,2,15,0.75)] md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
            <div className="flex-1 space-y-6">
              <header className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-fuchsia-200/80">
                  dose.wiki preview
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{record.name}</h1>
                {categories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <span
                        key={category}
                        className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white/80"
                      >
                        {formatCategoryLabel(category)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/65">No category tags recorded for this article.</p>
                )}
              </header>

              <section className="rounded-3xl border border-white/10 bg-[#120b25]/80 p-5 shadow-[0_20px_45px_rgba(8,3,18,0.45)]">
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">
                    First documented route
                  </p>
                  <p className="text-lg font-semibold text-white">
                    {primaryRoute?.label ?? "Route data unavailable"}
                  </p>
                  {primaryRoute?.units && (
                    <p className="text-sm text-white/65">Units: {primaryRoute.units}</p>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Scale className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
                      <span>Dosage</span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {dosageEntries.length > 0 ? (
                        dosageEntries.map((entry) => {
                          const details = Array.isArray(entry.details) ? entry.details : [];
                          return (
                            <div
                              key={entry.label}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-white">{entry.label}</span>
                                <span className="text-white/80">{entry.value ?? "—"}</span>
                              </div>
                              {details.length > 0 && (
                                <div className="mt-1.5 space-y-0.5 text-xs text-white/70">
                                  {details.map((detail) => (
                                    <div
                                      key={`${entry.label}-${detail.label}-${detail.value}`}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="text-white/75">{detail.label}</span>
                                      <span className="text-white/70">{detail.value ?? "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm italic text-white/70">
                          Dosage guidance is not available for this route.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Timer className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
                      <span>Duration</span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {durationEntries.length > 0 ? (
                        durationEntries.map((entry) => (
                          <div
                            key={entry.label}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
                          >
                            <span className="font-semibold text-white">{entry.label}</span>
                            <span className="text-white/80">{entry.value ?? "—"}</span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm italic text-white/70">
                          Duration details are not available for this route.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex w-full max-w-[280px] flex-col items-center justify-center md:w-auto">
              <div className="relative w-full">
                <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-fuchsia-500/20 blur-3xl" aria-hidden="true" />
                <div className="relative rounded-[28px] border border-white/15 bg-white/5 p-6 shadow-[0_25px_60px_rgba(8,3,18,0.55)]">
                  <img
                    src={previewImageSrc}
                    alt={previewImageAlt}
                    className="mx-auto h-auto max-h-[260px] w-full object-contain drop-shadow-[0_30px_60px_rgba(3,0,8,0.8)]"
                  />
                </div>
              </div>
              <p className="mt-4 text-center text-xs uppercase tracking-[0.35em] text-white/60">
                {content.moleculeAsset ? "Molecule SVG" : "dose.wiki mark"}
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-white/70">
          Share this link:
          <a
            href={shareHash}
            className="ml-2 text-fuchsia-200 transition hover:text-fuchsia-100"
            target="_blank"
            rel="noreferrer"
          >
            {shareUrl}
          </a>
        </p>
      </div>
    </div>
  );
}
