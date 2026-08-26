import { SUBSTANCE_INDEX_DEFAULT_VIEW, substanceIndexViewPath } from "@/utils/indexViewRoutes";
import {
  getSubstancesIndexMetadata,
  SubstancesIndexRoute,
} from "./_components/SubstancesIndexRoute";

export const revalidate = 3600;

const PATHNAME = substanceIndexViewPath(SUBSTANCE_INDEX_DEFAULT_VIEW);

export function generateMetadata() {
  return getSubstancesIndexMetadata(PATHNAME);
}

export default function SubstancesPage() {
  return (
    <SubstancesIndexRoute
      initialView={SUBSTANCE_INDEX_DEFAULT_VIEW}
      pathname={PATHNAME}
    />
  );
}
