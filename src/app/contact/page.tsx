import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { ContactPage } from "@/features/effect-index/pages/ContactPage";

const METADATA = {
  title: "Contact Us",
  description:
    "How to reach the Effect Index staff by email, and the site founder's own Discord, Reddit and email contact details.",
  route: { family: "contact" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-contact-description", "contact-intro-effect-index"]);

  return buildPublicPageMetadata({
    ...METADATA,
    description: copy.text("seo-contact-description") || METADATA.description,
  });
}

export default async function ContactRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();
  const copy = await getCopyByKeys(["seo-contact-description", "contact-intro-effect-index"]);

  return (
    <ContactPage
      intro={copy.text("contact-intro-effect-index")}
    />
  );
}
