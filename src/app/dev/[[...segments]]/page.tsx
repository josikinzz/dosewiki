import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { getOwnedContributorProfile } from "@server/convex/publicData";
import { getEditorBrowserReadTarget } from "@server/convex/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { canAccessDev, getDevRouteDecision } from "@/lib/auth/roles";
import { NextDevProfileRouteClient } from "../_components/NextDevProfileRouteClient";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";
import type { DevTab } from "@/types/navigation";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Dev",
  description: "Protected editor surface for the Next.js migration shell.",
  pathname: STATUS_PAGE_PATHS.dev,
});

type DevPageProps = {
  params: Promise<{
    segments?: string[];
  }>;
};

function resolveDevRoute(segments: string[] | undefined): { tab: DevTab; slug?: string } {
  const [candidateTab, slug] = segments ?? [];

  if (candidateTab === "change-log" || candidateTab === "changelog") {
    return { tab: "change-log", slug };
  }

  if (candidateTab === "tag-editor" || candidateTab === "tag") {
    return { tab: "tag-editor", slug };
  }

  if (candidateTab === "profile" || candidateTab === "profiles") {
    return { tab: "profile", slug };
  }

  if (candidateTab === "index-layout" || candidateTab === "index") {
    return { tab: "index-layout", slug };
  }

  if (candidateTab === "about") {
    return { tab: "about", slug };
  }

  if (candidateTab === "citation-review" || candidateTab === "citations") {
    return { tab: "citation-review", slug };
  }

  if (candidateTab === "trip-report-submissions" || candidateTab === "trip-reports") {
    return { tab: "trip-report-submissions", slug };
  }

  if (candidateTab === "article-feedback" || candidateTab === "feedback") {
    return { tab: "article-feedback", slug };
  }

  if (candidateTab === "molecule-editor" || candidateTab === "molecules") {
    return { tab: "molecule-editor", slug };
  }

  if (candidateTab === "review") {
    return { tab: "review", slug };
  }

  return { tab: "articles", slug };
}

export default async function NextDevPage({ params }: DevPageProps) {
  const resolvedParams = await params;
  const route = resolveDevRoute(resolvedParams.segments);

  // Review mode graduated to its own full-bleed workbench; the dev-shell
  // address keeps working as a deep link.
  if (route.tab === "review") {
    redirect(route.slug ? `/review/${route.slug}` : "/review");
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;
  const pathname = route.tab === "profile" ? STATUS_PAGE_PATHS.devProfile : STATUS_PAGE_PATHS.dev;
  const decision = getDevRouteDecision({ pathname, email, role });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in") {
    redirect(redirectTarget.href);
  }

  if (redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  const userEmail = email?.trim() ?? "";
  let ownedProfile: Awaited<ReturnType<typeof getOwnedContributorProfile>> = null;
  if (userEmail) {
    try {
      ownedProfile = await getOwnedContributorProfile(userEmail);
    } catch (error) {
      console.error("Unable to resolve the owned contributor profile; rendering the /dev shell without it.", error);
    }
  }
  const initialProfileKey = ownedProfile?.key ?? (userEmail ? deriveProfileKeyFromEmail(userEmail) : undefined);
  const allowedRole = decision.type === "allow" ? decision.role : null;

  if (route.tab === "profile" && !canAccessDev(allowedRole)) {
    return <NextDevProfileRouteClient initialProfileKey={initialProfileKey} />;
  }

  const convexUrl = getEditorBrowserReadTarget().selectedUrl;

  return (
    <NextDevRouteClient
      convexUrl={convexUrl}
      initialTab={route.tab}
      initialSlug={route.slug}
      initialProfileKey={initialProfileKey}
    />
  );
}
