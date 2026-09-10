import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { getOwnedContributorProfile } from "@server/convex/publicData";
import {
  CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR,
  getEditorTargetAlignment,
} from "@server/convex/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { getDevRouteDecision } from "@/lib/auth/roles";
import {
  ConvexTargetSplitBanner,
  ConvexTargetSplitRefusal,
} from "../../_components/ConvexTargetSplitNotice";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";
import { findDevTab, resolveDevRoute } from "@/features/dev/pages/devTabRegistry";

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
  /** Tab filters (`/dev/writing?kind=blog`) live here; see the registry's `filter`. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NextDevPage({ params, searchParams }: DevPageProps) {
  const [tabSegment, slugSegment] = (await params).segments ?? [];
  const route = resolveDevRoute(tabSegment, slugSegment, await searchParams);

  // Review mode graduated to its own full-bleed workbench; the dev-shell
  // address keeps working as a deep link.
  const destination = findDevTab(route.tab).destination;
  if (destination.kind === "external") {
    redirect(route.slug ? `${destination.href}/${route.slug}` : destination.href);
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;
  // Any signed-in member role may open the shell; a tab above the role
  // renders disabled with a reason rather than bouncing.
  const decision = getDevRouteDecision({ pathname: STATUS_PAGE_PATHS.dev, email, role });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in") {
    redirect(redirectTarget.href);
  }

  if (redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  // Resolved server-side on purpose: the privileged write URL must never be
  // shipped to the browser, so the comparison happens here and only deployment
  // names cross into the rendered output.
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
  // session email straight away, the same fallback that read uses, and adopts
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

  return withSplitBanner(
    <NextDevRouteClient
      initialTab={route.tab}
      initialSlug={route.slug}
      initialFilter={route.filter}
      initialProfileKey={initialProfileKey}
      ownedProfileKey={ownedProfileKey}
    />,
  );
}
