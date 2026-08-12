import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { getOwnedContributorProfile } from "@server/convex/publicData";
import {
  CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR,
  getEditorBrowserReadTarget,
  getEditorTargetAlignment,
} from "@server/convex/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { canAccessDev, getDevRouteDecision } from "@/lib/auth/roles";
import {
  ConvexTargetSplitBanner,
  ConvexTargetSplitRefusal,
} from "../../_components/ConvexTargetSplitNotice";
import { NextDevProfileRouteClient } from "../_components/NextDevProfileRouteClient";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";
import type { DevTab } from "@/types/navigation";

// No `force-dynamic`: the route already opts out of caching by reading the
// session cookie, and the flag additionally blocked the static shell from
// being emitted at build time.
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

  // The standalone About tool folded into the Writing tab, where it is the
  // pinned first entry in the rail. `/dev/about` therefore resolves — rather
  // than 404s or lands on the article list — straight onto that entry.
  if (candidateTab === "about") {
    return { tab: "writing", slug: "about" };
  }

  if (candidateTab === "writing") {
    return { tab: "writing", slug };
  }

  if (candidateTab === "blog") {
    return { tab: "blog", slug };
  }

  if (candidateTab === "copy-studio" || candidateTab === "copy") {
    return { tab: "copy-studio", slug };
  }

  if (candidateTab === "contributors" || candidateTab === "contributor") {
    return { tab: "contributors", slug };
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

  if (candidateTab === "replications" || candidateTab === "replication-studio") {
    return { tab: "replications", slug };
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

  // Resolved server-side on purpose: the privileged write URL must never be
  // shipped to the browser, so the comparison happens here and only deployment
  // names cross into the rendered output. Checked ahead of both shells — the
  // profile shell writes to Convex too.
  const alignment = getEditorTargetAlignment();

  if (alignment.status === "split" && !alignment.overrideAcknowledged) {
    return (
      <ConvexTargetSplitRefusal
        alignment={alignment}
        surface="/dev editor shell"
        overrideEnvVar={CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR}
      />
    );
  }

  const withSplitBanner = (shell: ReactElement) =>
    alignment.status === "split" ? (
      <>
        <ConvexTargetSplitBanner
          alignment={alignment}
          surface="/dev editor shell"
          overrideEnvVar={CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR}
        />
        {shell}
      </>
    ) : (
      shell
    );

  const userEmail = email?.trim() ?? "";
  // Deliberately not awaited: `getOwnedContributorProfile` is an uncached,
  // privileged Convex read, and awaiting it here put a full round trip in front
  // of the first byte of the shell. The browser gets the key derived from the
  // session email straight away — the same fallback that read uses — and adopts
  // the canonical key when the promise lands.
  const ownedProfileKey = userEmail
    ? getOwnedContributorProfile(userEmail)
        .then((profile) => profile?.key ?? null)
        .catch((error: unknown) => {
          console.error("Unable to resolve the owned contributor profile; rendering the /dev shell without it.", error);
          return null;
        })
    : undefined;
  const initialProfileKey = userEmail ? deriveProfileKeyFromEmail(userEmail) : undefined;
  const allowedRole = decision.type === "allow" ? decision.role : null;

  if (route.tab === "profile" && !canAccessDev(allowedRole)) {
    return withSplitBanner(
      <NextDevProfileRouteClient
        initialProfileKey={initialProfileKey ?? ""}
        ownedProfileKey={ownedProfileKey}
      />,
    );
  }

  const convexUrl = getEditorBrowserReadTarget().selectedUrl;

  return withSplitBanner(
    <NextDevRouteClient
      convexUrl={convexUrl}
      initialTab={route.tab}
      initialSlug={route.slug}
      initialProfileKey={initialProfileKey}
      ownedProfileKey={ownedProfileKey}
    />,
  );
}
