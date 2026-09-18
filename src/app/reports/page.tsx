import { REPORTS_INDEX_DEFAULT_VIEW, reportsIndexViewPath } from "@/utils/indexViewRoutes";
import {
  getReportsIndexMetadata,
  ReportsIndexRoute,
} from "./_components/ReportsIndexRoute";

export const revalidate = 3600;

const PATHNAME = reportsIndexViewPath(REPORTS_INDEX_DEFAULT_VIEW);

export function generateMetadata() {
  return getReportsIndexMetadata(PATHNAME);
}

export default function ReportsPage() {
  return (
    <ReportsIndexRoute
      initialView={REPORTS_INDEX_DEFAULT_VIEW}
      pathname={PATHNAME}
    />
  );
}
