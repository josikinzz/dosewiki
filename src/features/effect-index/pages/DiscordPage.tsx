import { AppImage } from "@/components/common/AppImage";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { applyPlaceholders } from "@/data/content/about";
import { ContentCard } from "@/components/ui/surface";
import { icons } from "@/utils/iconNames";
import { EFFECT_INDEX_DISCORD_INVITE_URL } from "@server/next/effectIndexLegacyRedirects";

/**
 * Effect Index's Discord page, transcribed from the old site's `pages/discord.vue`.
 *
 * The invite URL is read from the legacy redirect table that already owns it, so `/discord`
 * and the `/discord-chat` redirect cannot drift apart.
 *
 * The old page also embedded Discord's server widget in an `<iframe>`. That is dropped:
 * it pointed at the retired `discordapp.com` host, it is hard-pinned to `theme=dark`
 * against a light skin, it only renders at all while the guild keeps the widget enabled,
 * and it is a third-party frame this site's CSP has no reason to admit. The join link and
 * the description carry everything the widget was there for.
 *
 * There is deliberately no "Join the Discord" button: the invite the legacy redirect table
 * owns is expired upstream, so promoting it to the page's primary action would lead with a
 * broken one. The old site buried the same link in prose and this page does the same until
 * a fresh invite exists — see the note on the `/discord-chat` entry.
 */

const INTRO_MARKDOWN = `The official Effect Index community is hosted on Discord and may be joined [here.](${EFFECT_INDEX_DISCORD_INVITE_URL})

This a semi-private community and is not primarily for general conversation; instead, it aims to be a place of discussion and co-operation for progressing the field of formalised subjective effect documentation. For this reason, we tend to only invite people who genuinely want to contribute to the project. This can include anyone from proofreaders, trip reporters, web developers, programmers, replicators, artists, and more.

If you have an interest in contributing to and taking part in our community's various projects, please contact us within the public waiting room channel and tell us why you are interested in this project. Thanks!`;

// Verbatim from the old site, in order.
const RULES = [
  "You must be at least 18+ years old.",
  "Please be polite and reasonable.",
  "You may not discuss any drug sources. Not even in DMs.",
  "Keep specific topics within their relevant channels.",
  "This community is inclusive and does not accept any kind of racism, homophobia, sexism, transphobia, ableism, general hatefulness, etc, etc.",
  "This community is relatively Safe For Work (SFW), please do not post overtly sexual or edgy content. This includes hornyposting and excessive shitposting.",
];

export function DiscordPage({
  intro,
  rules,
}: { intro?: string; rules?: string[] } = {}) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader title="Discord Chat" icon={icons.discord} />

      <div className="flex flex-col gap-8 sm:flex-row-reverse sm:items-start sm:gap-10">
        <div className="mx-auto flex shrink-0 flex-col items-center gap-4 sm:mx-0">
          <AppImage
            src="/effectindex/discord-community.png"
            alt="The Effect Index eye mascot holding up a phone"
            width={661}
            height={882}
            sizes="(max-width: 640px) 11rem, 14rem"
            className="h-auto w-44 sm:w-56"
          />
        </div>

        <div className="min-w-0 flex-1">
          <PublicMarkdownBody
            content={
              intro
                ? applyPlaceholders(intro, {
                    discordInvite: EFFECT_INDEX_DISCORD_INVITE_URL,
                  })
                : INTRO_MARKDOWN
            }
          />
        </div>
      </div>

      <section className="mt-12 space-y-6">
        <PublicSectionHeading icon={icons.listOrdered} title="Rules" />

        <ContentCard variant="public" padding="lg" radius="xl">
          <ol className="theme-text-secondary list-decimal space-y-3 pl-6 text-[1.0625rem] leading-7 marker:text-dose-accent-muted">
            {(rules?.length ? rules : RULES).map((rule) => (
              <li key={rule} className="pl-1">
                {rule}
              </li>
            ))}
          </ol>
        </ContentCard>
      </section>
    </PublicContentShell>
  );
}
