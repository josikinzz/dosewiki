'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/i18n/client';
import { Suspense } from 'react';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import type { TripReportSubstance } from '@/types/tripReport';
import { getReportBackTarget, type SubstanceLookupRecord } from '../domain/tripReportIndex';

/**
 * The report page's back link. `?from=<substance slug>` names the substance
 * page the reader arrived from, and only tweaks this one control — so it is
 * read here, on the client, inside a Suspense boundary. That keeps
 * /reports/[slug] statically rendered: the prerendered HTML carries the
 * default target ("Back to Reports" / the report's own substance), and a
 * `?from=` visit swaps in its target as soon as the client render takes over.
 */

interface ReportBackLinkProps {
  /** The report's own substances, for the default label's matching chain. */
  substances: TripReportSubstance[];
  /**
   * Public substance slug → name, for resolving an arbitrary `?from=` slug to
   * "Back to <name>". The full lookup rides along because `from` can be any
   * substance page — including one that matched the report through an
   * identification alias rather than a substance name the report itself uses.
   */
  substanceBySlug: Record<string, SubstanceLookupRecord>;
}

export function ReportBackLink(props: ReportBackLinkProps) {
  return (
    <Suspense fallback={<BackButton {...props} />}>
      <FromAwareBackButton {...props} />
    </Suspense>
  );
}

/** The one component allowed to touch `useSearchParams` — see above. */
function FromAwareBackButton(props: ReportBackLinkProps) {
  const from = useSearchParams().get('from') ?? undefined;
  return <BackButton {...props} fromSubstanceSlug={from} />;
}

function BackButton({
  substances,
  substanceBySlug,
  fromSubstanceSlug,
}: ReportBackLinkProps & { fromSubstanceSlug?: string }) {
  const t = useT();
  const backTarget = getReportBackTarget({
    report: { substances },
    substanceBySlug,
    fromSubstanceSlug,
    // The label names its target in the render locale; the domain stays
    // locale-agnostic and defaults to English formatting.
    translate: t,
  });

  return (
    <Button variant="ghostPill" size="pill" asChild className="w-fit">
      <Link href={backTarget.href}>
        <Icon icon="lucide:arrow-left" size={16} />
        {backTarget.label}
      </Link>
    </Button>
  );
}
