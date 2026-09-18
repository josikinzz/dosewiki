"use client";

import { usePathname } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/client";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

/**
 * The section's title, sized to what the tab underneath it actually needs.
 *
 * The Gallery tab is the section's default route and the one Experience
 * surface in the section: the app header already names the section, the active
 * tab already says "Gallery", and a 48px restatement of both was pushing the
 * first artwork 362px down a 900px viewport, so a reader met four works per
 * screen on a 6,607-work archive. On that tab the heading stays in the
 * document as an accessible-only `h1`, which keeps exactly one top-level
 * heading per page and starts the art at the top of the page.
 *
 * Every other tab (Tutorials, Audio, More Info) reads as a page rather than a
 * gallery, so it keeps the visible header.
 */
export function ReplicationsSectionTitle() {
  const pathname = usePathname();
  const t = useT();

  if (pathname === "/replications") {
    return <h1 className="sr-only">{t("Replications")}</h1>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        className="mb-4 gap-2"
        titleClassName="[--type-size-title:2.25rem] md:[--type-size-title:3rem]"
        title={t("Replications")}
        icon={resolveRouteChromeIcon("replications")}
      />
    </div>
  );
}
