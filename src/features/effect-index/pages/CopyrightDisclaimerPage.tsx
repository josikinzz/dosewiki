import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { icons } from "@/utils/iconNames";

/**
 * Effect Index's copyright disclaimer, transcribed from the old site's
 * `pages/copyright-disclaimer.vue`.
 *
 * This is the licensing statement the footer's reuse line points at, so it is reproduced
 * word for word — including the old page's own inconsistency, where the link text reads
 * "Creative Commons Attribution-ShareAlike License" while the href is the BY-NC-SA 4.0
 * deed. Rewriting either half would change what the site claims about its own terms.
 */

const PROJECT_EMAIL = "effectindex@gmail.com";

const DISCLAIMER_MARKDOWN = `EffectIndex.com and its materials, including all indexing-related and written content, are available under the [Creative Commons Attribution-ShareAlike License](https://creativecommons.org/licenses/by-nc-sa/4.0/) for non-commercial use. Additional terms may apply; contact [${PROJECT_EMAIL}](mailto:${PROJECT_EMAIL}) for more information and commercial inquiries.

All replications, multimedia, and non-SEI artwork belong to their original creators and are protected by international copyright laws. Artwork used without the creator's permission is reproduced at diminished quality and assumed to constitute "fair use" for educational and non-profit purposes. If you would like your artwork removed or reattributed, please contact [${PROJECT_EMAIL}](mailto:${PROJECT_EMAIL})`;

export function CopyrightDisclaimerPage({
  disclaimer,
}: { disclaimer?: string } = {}) {
  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader title="Copyright Disclaimer" icon={icons.scale} />

      <PublicMarkdownBody content={disclaimer || DISCLAIMER_MARKDOWN} />
    </PublicContentShell>
  );
}
