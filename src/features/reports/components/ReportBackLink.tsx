'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/i18n/client';
import { Suspense } from 'react';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import type { TripReportSubstance } from '@/types/tripReport';
import { getReportBackTarget, type SubstanceLookupRecord } from '../domain/tripReportIndex';

interface ReportBackLinkProps {
  substances: TripReportSubstance[];
  substanceBySlug: Record<string, SubstanceLookupRecord>;
}

export function ReportBackLink(props: ReportBackLinkProps) {
  return (
    <Suspense fallback={<BackButton {...props} />}>
      <FromAwareBackButton {...props} />
    </Suspense>
  );
}

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
