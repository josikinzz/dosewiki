import { AppImage } from "@/components/common/AppImage";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicMetadataList } from "@/components/layout/PublicContentPrimitives";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { ContentCard, InteractiveSurface } from "@/components/ui/surface";
import { icons } from "@/utils/iconNames";

/**
 * Effect Index's donation page, transcribed from the old site's `pages/donate.vue`.
 *
 * The copy, the donation destinations and the Ethereum address are ported verbatim — this
 * is a funding page, so paraphrasing an address or a platform name would be a defect. The
 * old page's `<FrontpageArticle />` promo slot is dropped: it rendered whichever article
 * carried `frontpage: true` in a store this codebase does not have, and it was never
 * donation copy.
 */

const ETHEREUM_ADDRESS = "0xaaAcEF54d563CE7d3Cff5bE5cBeEcAbAf5816f78";
const ETHEREUM_EXPLORER_URL = `https://etherscan.io/address/${ETHEREUM_ADDRESS}`;

const INTRO_MARKDOWN = `If you would be interested in contributing to the Effect Index project we have a number of donation options available. The funds will be used for hosting costs and enable us to devote more of our time to Subjective Effect Documentation.

Any contribution is greatly appreciated!`;

export function DonatePage({ intro }: { intro?: string } = {}) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader title="Donate" icon={icons.heart} />

      <div className="flex flex-col gap-8 sm:flex-row-reverse sm:items-start sm:gap-10">
        <AppImage
          src="/effectindex/donate.png"
          alt="The Effect Index eye mascot holding up a heart"
          width={784}
          height={1073}
          sizes="(max-width: 640px) 11rem, 14rem"
          className="mx-auto h-auto w-44 shrink-0 sm:mx-0 sm:w-56"
        />

        <div className="min-w-0 flex-1">
          <PublicMarkdownBody content={intro || INTRO_MARKDOWN} />
        </div>
      </div>

      <section className="mt-12 space-y-6">
        <PublicSectionHeading icon={icons.heart} title="Options" />

        <PublicMetadataList
          items={[
            {
              key: "patreon",
              icon: icons.star,
              label: "Patreon",
              value: "Effect Index Patreon",
              href: "https://www.patreon.com/JosieKins",
            },
            {
              key: "teespring",
              icon: icons.shapes,
              label: "TeeSpring",
              value: "Merchandise Store",
              href: "https://teespring.com/stores/effectindex",
            },
            {
              key: "paypal",
              icon: icons.mail,
              label: "Paypal",
              // Plain text on the old site, and kept that way: it is a PayPal account
              // identifier rather than an address to start a mail client with.
              value: "effectindex@gmail.com",
            },
          ]}
        />
      </section>

      <section className="mt-12 space-y-6">
        <PublicSectionHeading icon={icons.hexagon} title="Ethereum" />

        <ContentCard variant="public" padding="lg" radius="xl">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            {/* The QR art is transparent with dark modules, so it needs a light plate and
                a quiet zone around it to stay scannable — that is what the subtle surface
                and its padding provide. */}
            <InteractiveSurface
              asChild
              variant="quiet"
              padding="xs"
              radius="lg"
              className="shrink-0"
            >
              <a
                href={ETHEREUM_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <AppImage
                  src="/effectindex/eth-qrcode.png"
                  alt={`QR code for the Effect Index Ethereum address ${ETHEREUM_ADDRESS}`}
                  width={132}
                  height={132}
                  className="h-[132px] w-[132px]"
                />
              </a>
            </InteractiveSurface>

            <a
              href={ETHEREUM_EXPLORER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-link-muted min-w-0 break-all text-center font-mono text-sm transition hover:underline hover:underline-offset-2 sm:text-left sm:text-base"
            >
              {ETHEREUM_ADDRESS}
            </a>
          </div>
        </ContentCard>
      </section>
    </PublicContentShell>
  );
}
