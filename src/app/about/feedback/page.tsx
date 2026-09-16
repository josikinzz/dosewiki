import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Surface } from "@/components/ui/surface";
import { SiteFeedbackForm } from "@/features/site-feedback/components/SiteFeedbackForm";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export async function generateMetadata() {
  const copy = await getCopyByKeys([flavoredCopyKey("seo-about-feedback-description")]);

  return buildPublicPageMetadata({
    title: "General feedback",
    description: flavoredCopyText(
      copy,
      "seo-about-feedback-description",
      `Send the ${SITE_FLAVOR_CONFIG.name} editors private feedback about the site — an article request, a technical issue, design, performance, or accessibility.`,
    ),
    pathname: "/about/feedback",
  });
}

export default function SiteFeedbackPage() {
  return (
    <PublicContentShell width="narrow">
      <PageHeader
        title="General feedback"
        icon="lucide:message-circle"
        align="left"
        description={`Feedback about ${SITE_FLAVOR_CONFIG.name} as a whole — the site, its features, its design. For corrections to a specific article, use the \u201CSuggest an edit\u201D box at the bottom of that article.`}
      />

      <Surface variant="subtle" padding="lg" radius="xl">
        <SiteFeedbackForm />
      </Surface>
    </PublicContentShell>
  );
}
