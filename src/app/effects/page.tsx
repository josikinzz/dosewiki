import { EFFECT_INDEX_DEFAULT_VIEW, effectIndexViewPath } from "@/utils/indexViewRoutes";
import {
  EffectsIndexRoute,
  getEffectsIndexMetadata,
} from "./_components/EffectsIndexRoute";

export const revalidate = 3600;

const PATHNAME = effectIndexViewPath(EFFECT_INDEX_DEFAULT_VIEW);

export function generateMetadata() {
  return getEffectsIndexMetadata(PATHNAME);
}

export default function EffectsPage() {
  return (
    <EffectsIndexRoute
      initialView={EFFECT_INDEX_DEFAULT_VIEW}
      pathname={PATHNAME}
    />
  );
}
