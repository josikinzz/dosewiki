import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { publicMarkdownComponents } from "@/components/pages/PublicMarkdownBody";
import { ReplicationsFairUseNotice } from "@/features/replications/components/ReplicationsFairUseNotice";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  REPLICATIONS_FAIR_USE_NOTICE_FALLBACK,
  REPLICATIONS_FAIR_USE_NOTICE_KEY,
} from "@/features/replications/replicationsFairUseCopy";
import {
  REPLICATIONS_INTRO_FALLBACK,
  REPLICATIONS_INTRO_KEY,
} from "@/features/replications/replicationsInfoCopy";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { t } from "@/i18n/server";
import CopyBlock from "@/features/dev/tools/copy-studio/CopyBlock.editor";

const REPLICATIONS_INFO_COPY_KEYS = [
  "seo-replications-more-info-description",
  REPLICATIONS_INTRO_KEY,
  REPLICATIONS_FAIR_USE_NOTICE_KEY,
];

const introMarkdownComponents = {
  ...publicMarkdownComponents,
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-secondary max-w-3xl text-base" {...props} />
  ),
};

export async function getReplicationsInfoMetadata(locale: LiveLocale | null = null) {
  const copy = await getCopyByKeys(REPLICATIONS_INFO_COPY_KEYS);

  return buildPublicPageMetadata({
    title: "About Replications",
    description:
      copy.text("seo-replications-more-info-description") ||
      "What replications are, why this art is hosted here, and how artists are credited.",
    route: { family: "replicationInfo" },
    noIndex: locale !== null,
  });
}

/**
 * The More Info tab, shared by the English route and every locale mirror: the
 * section's standing prose, moved off the Gallery so the media leads. Both
 * blocks are editable copy; on a mirror each block's current English text is
 * the catalog key, exactly as the About page localizes its copy, so an edit
 * renders in English until the catalog catches up.
 */
export async function ReplicationsInfoRoute() {
  const copy = await getCopyByKeys(REPLICATIONS_INFO_COPY_KEYS);

  return (
    <>
      <ReplicationsTabNav />
      <div className="mx-auto mt-8 w-full max-w-7xl">
        <h2 className="sr-only">{t("More Info")}</h2>

        <CopyBlock copyKey={REPLICATIONS_INTRO_KEY}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={introMarkdownComponents}
        >
          {t(copy.text(REPLICATIONS_INTRO_KEY) || REPLICATIONS_INTRO_FALLBACK)}
        </ReactMarkdown>
        </CopyBlock>

        <CopyBlock copyKey={REPLICATIONS_FAIR_USE_NOTICE_KEY}>
        <ReplicationsFairUseNotice
          body={t(
            copy.text(REPLICATIONS_FAIR_USE_NOTICE_KEY) ||
            REPLICATIONS_FAIR_USE_NOTICE_FALLBACK,
          )}
        />
        </CopyBlock>
      </div>
    </>
  );
}
