import { redirect } from "next/navigation";
import { getRequestSession } from "@server/next/requestSession";
import {
  getEditorTargetAlignment,
} from "@server/data/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getDevRouteDecision } from "@/lib/auth/roles";
import {
  DataTargetSplitRefusal,
} from "../../_components/DataTargetSplitNotice";
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

  const session = await getRequestSession();
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;
  const decision = getDevRouteDecision({ pathname: STATUS_PAGE_PATHS.dev, email, role, floor: "editor" });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in" || redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  // Resolved server-side on purpose: the privileged write URL must never be
  // shipped to the browser, so the comparison happens here and only deployment
  // names cross into the rendered output.
  const alignment = getEditorTargetAlignment();

  if (alignment.status === "split") {
    return (
      <DataTargetSplitRefusal
        alignment={alignment}
        surface="review workbench"
      />
    );
  }

  return <ReviewRouteClient initialSlug={initialSlug} />;
}
