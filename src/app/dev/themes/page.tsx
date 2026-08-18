import { notFound } from "next/navigation";
import {
  buildNoIndexPageMetadata,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { isEffectIndex } from "@/config/siteFlavor";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Palette Lab",
  description: "Interactive palette editor for the dose.wiki visual styles.",
  pathname: STATUS_PAGE_PATHS.dev,
});

export default async function DevThemesPage() {
  // The Palette Lab is public on DoseWiki, but Effect Index does not own this
  // developer route. Keep the publication boundary as a real 404.
  if (isEffectIndex()) {
    notFound();
  }

  return <ThemeLabWorkbench />;
}
