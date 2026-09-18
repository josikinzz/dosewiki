import { SmartLink } from "@/components/common/SmartLink";

import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { publicHref } from "@/utils/publicHref";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { normalizeVCodeContent } from "@/features/effects/vcode/normalize";
import type { ArtistCreditLinks } from "@/features/effects/vcode/artistCreditLinks";
import type { PublicEffectSummary } from "@server/data/publicData";
import { t } from "@/i18n/server";

interface PsychoactiveEffectLongSummaryProps {
  effect: PublicEffectSummary;
  artistCreditLinks?: ArtistCreditLinks;
  /** The drug class this summary page speaks for. */
  mediaVariantKey?: string;
}

/**
 * Effect Index's long-summary block, adapted to the public dose.wiki article
 * typography. Data selection stays in the server route loader.
 */
export function PsychoactiveEffectLongSummary({
  effect,
  artistCreditLinks,
  mediaVariantKey,
}: PsychoactiveEffectLongSummaryProps) {
  const href = publicHref.effect(effect.slug);
  const longSummaryContent = normalizeVCodeContent(
    effect.long_summary_ast,
    effect.long_summary_raw,
  );

  return (
    <article className="flow-root border-b border-dose-divider pb-8 last:border-b-0 last:pb-0">
      <h3 className="text-xl font-semibold tracking-tight">
        <SmartLink
          href={href}
          className="group/effect theme-accent-heading theme-focus-ring inline-flex items-center gap-2 transition-opacity hover:opacity-85"
        >
          <span className="min-w-0 break-words">{effect.name}</span>
          <Icon
            icon="lucide:arrow-right"
            className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 group-hover/effect:translate-x-0 group-hover/effect:opacity-70 motion-reduce:transform-none motion-reduce:transition-none"
          />
        </SmartLink>
      </h3>

      <p className="theme-text-muted mt-1 text-sm italic">
        {t("Full article:")}{" "}
        <SmartLink href={href} className={proseLinkClassName}>
          {effect.name}
        </SmartLink>
      </p>

      {longSummaryContent ? (
        <div className="theme-text-secondary prose prose-fuchsia mt-5 max-w-none">
          <VCodeRenderer
            content={longSummaryContent}
            citations={effect.citations}
            subarticles={effect.subarticles}
            artistCreditLinks={artistCreditLinks}
            mediaVariantKey={mediaVariantKey}
          />
        </div>
      ) : null}
    </article>
  );
}
