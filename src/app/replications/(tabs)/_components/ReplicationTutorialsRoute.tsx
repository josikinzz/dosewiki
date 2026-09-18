import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SectionCard } from "@/components/common/SectionCard";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import { t } from "@/i18n/server";

/**
 * Tutorial titles and authors are the works as their authors named them, so
 * they stay in the source language on every mirror; only the page's own
 * sentences translate.
 */
const TUTORIALS = [
  {
    title: "Symmetrical Texture Repetition",
    href: "https://www.youtube.com/watch?v=3cUBq1tHO-A",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Tracer Tutorial",
    href: "https://www.youtube.com/watch?v=KaBBGipVly8",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Breathing / Shifting / Melting Tutorial",
    href: "https://www.youtube.com/watch?v=W6t9A-52-ZU",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Compositions / Multiple Effects",
    href: "https://www.youtube.com/watch?v=ZRDPPWTyM-A",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "How to Format WEBM for Gfycat",
    href: "https://www.reddit.com/r/replications/comments/5bmzeo/how_to_produce_hd_webm_for_gfycat/",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
] as const;

export async function getReplicationTutorialsMetadata(locale: LiveLocale | null = null) {
  const copy = await getCopyByKeys(["seo-replications-tutorials-description"]);

  return buildPublicPageMetadata({
    title: "Replication Tutorials",
    description:
      copy.text("seo-replications-tutorials-description") ||
      "Tutorials and resources for replicating specific subjective effects, preserved from the Effect Index archive.",
    route: { family: "replicationTutorials" },
    noIndex: locale !== null,
  });
}

/** The Tutorials tab, shared by the English route and every locale mirror. */
export function ReplicationTutorialsRoute() {
  // One key per sentence; each link is spliced back in at its placeholder so
  // a translation can move it.
  const [footageBefore, footageAfter] = t(
    "For a collection of high res royalty free nature stock footage that can be used within replication videos, please {{link}}",
  ).split("{{link}}");
  const [audioBefore, audioAfter] = t(
    "For audio recreations of what an effect sounds like, see the {{link}}.",
  ).split("{{link}}");
  const [termsBefore, termsAfter] = t(
    "Tutorials are linked to their authors and hosted elsewhere; {{site}} does not host or license them. For replication media hosted here, see the {{terms}} to correct a credit or request removal.",
    { site: SITE_FLAVOR_CONFIG.name },
  ).split("{{terms}}");

  return (
    <>
      <ReplicationsTabNav />
      <div className="mx-auto mt-8 w-full max-w-3xl">
        <h2 className="sr-only">{t("Tutorials")}</h2>

        <SectionCard>
          <p className="theme-text-secondary text-[1.0625rem] leading-7">
            {t("This page serves as a dedicated index for information and resources on replicating specific subjective effects.")}
          </p>

          <ul className="theme-text-secondary mt-6 space-y-4 text-[1.0625rem] leading-7 marker:text-dose-accent-muted">
            {TUTORIALS.map((tutorial) => (
              <li key={tutorial.href}>
                <a
                  href={tutorial.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={proseLinkClassName}
                >
                  <strong>{tutorial.title}</strong>
                </a>{" "}
                {t("by")}{" "}
                <a
                  href={tutorial.artistHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={proseLinkClassName}
                >
                  {tutorial.artist}
                </a>
              </li>
            ))}
          </ul>

          <p className="theme-text-secondary mt-6 text-[1.0625rem] leading-7">
            {footageBefore}
            <a
              href="http://mitchmartinez.com/free-4k-red-epic-stock-footage/"
              target="_blank"
              rel="noopener noreferrer"
              className={proseLinkClassName}
            >
              {t("click here.")}
            </a>
            {footageAfter}
          </p>

          <p className="theme-text-secondary mt-6 text-[1.0625rem] leading-7">
            {audioBefore}
            <Link href="/replications/audio" className={proseLinkClassName}>
              {t("audio replications")}
            </Link>
            {audioAfter}
          </p>

          <p className="theme-text-muted mt-6 text-xs leading-5">
            {termsBefore}
            <Link
              href="/docs/license#replication-media-terms"
              className={proseLinkClassName}
            >
              {t("licensing terms")}
            </Link>
            {termsAfter}
          </p>
        </SectionCard>
      </div>
    </>
  );
}
