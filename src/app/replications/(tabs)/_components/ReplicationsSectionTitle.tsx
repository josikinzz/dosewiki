"use client";

import { usePathname } from "next/navigation";

import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/client";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

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
