import { notFound } from "next/navigation";

import {
  REPORTS_INDEX_VIEW_PARAMS,
  reportsIndexViewFromSlug,
  reportsIndexViewPath,
} from "@/utils/indexViewRoutes";
import {
  getReportsIndexMetadata,
  ReportsIndexRoute,
} from "../../_components/ReportsIndexRoute";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return REPORTS_INDEX_VIEW_PARAMS.map(({ slug }) => ({ groupSlug: slug }));
}

type ReportsGroupPageProps = {
  params: Promise<{ groupSlug: string }>;
};

export async function generateMetadata({ params }: ReportsGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = reportsIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  return getReportsIndexMetadata(reportsIndexViewPath(initialView));
}

export default async function ReportsGroupPage({ params }: ReportsGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = reportsIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const pathname = reportsIndexViewPath(initialView);
  return <ReportsIndexRoute initialView={initialView} pathname={pathname} />;
}
