import { buildPublicPageMetadata } from "@server/next/publicSite";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { ContactPage } from "@/features/effect-index/pages/ContactPage";

const METADATA = {
  title: "Contact Us",
  description:
    "How to reach the Effect Index staff by email, and the site founder's own Discord, Reddit and email contact details.",
  route: { family: "contact" } as const,
};

export async function generateMetadata() {
  requireEffectIndexFlavor();

  return buildPublicPageMetadata(METADATA);
}

export default function ContactRoute() {
  // Flavor gate first: on the dose.wiki build this route does not exist.
  requireEffectIndexFlavor();

  return <ContactPage />;
}
