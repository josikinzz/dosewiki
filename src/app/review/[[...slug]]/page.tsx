import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { getEditorBrowserReadTarget } from "@server/convex/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { ReviewRouteClient } from "../_components/ReviewRouteClient";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Review",
  description: "Full-screen manual review workbench for the launch corpus.",
  pathname: "/review",
});

type ReviewPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

/**
 * The dedicated review workbench (`/review`, `/review/[slug]`).
 *
 * This is the flip-through surface an editor lives in for a 250-article pass,
 * so it renders without the public site chrome or the dev-tools tab shell —
 * one sticky command bar over one article. Access is gated exactly like /dev:
 * the reviewer is an editor working on unpublished review state.
 */
export default async function ReviewPage({ params }: ReviewPageProps) {
  const resolvedParams = await params;
  const initialSlug = resolvedParams.slug?.[0];

  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;
  const decision = getDevRouteDecision({ pathname: STATUS_PAGE_PATHS.dev, email, role });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in" || redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  const convexUrl = getEditorBrowserReadTarget().selectedUrl;

  return <ReviewRouteClient convexUrl={convexUrl} initialSlug={initialSlug} />;
}
