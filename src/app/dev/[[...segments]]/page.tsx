import { redirect } from "next/navigation";
import { getDevShellSession } from "@server/next/devShellSession";
import { getOwnedContributorProfileKey } from "@server/data/publicData.contributors";
import {
  getEditorTargetAlignment,
} from "@server/data/serverWriteHealth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { getDevRouteDecision, roleMeetsFloor } from "@/lib/auth/roles";
import {
  DataTargetSplitRefusal,
} from "../../_components/DataTargetSplitNotice";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";
import {
  findDevTab,
  resolveDevRoute,
} from "@/features/dev/pages/devTabRegistry";

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
  const [tabSegment, slugSegment, nestedSegment] = (await params).segments ?? [];
  const route = resolveDevRoute(tabSegment, slugSegment, await searchParams, nestedSegment);

  // Review mode graduated to its own full-bleed workbench; the dev-shell
  // address keeps working as a deep link.
  const destination = findDevTab(route.tab).destination;
  if (destination.kind === "external") {
    redirect(route.slug ? `${destination.href}/${route.slug}` : destination.href);
  }
  const { session, screenshotViewer } = await getDevShellSession();
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

  // Bare `/dev` (where sign-in returns) needs no redirect: the route resolves
  // it to Home, which every member role can open and which shows that role's
  // own work. The Inbox and every tool stay one click away on the rail.

  // Resolved server-side on purpose: the privileged write URL must never be
  // shipped to the browser, so the comparison happens here and only deployment
  // names cross into the rendered output.
  const alignment = getEditorTargetAlignment();

  if (alignment.status === "split") {
    return (
      <DataTargetSplitRefusal
        alignment={alignment}
        surface="/dev editor shell"
      />
    );
  }

  const userEmail = email?.trim() ?? "";
  // Resolve the canonical owned key without delaying the shell or materializing
  // the full profile. The email-derived key remains the existing initial fallback.
  // The local screenshot viewer has no membership, so it skips this private read.
  const ownedProfileKey = userEmail && !screenshotViewer
    ? getOwnedContributorProfileKey(userEmail)
        .catch((error: unknown) => {
          console.error("Unable to resolve the owned contributor profile; rendering the /dev shell without it.", error);
          return null;
        })
    : undefined;
  const initialProfileKey = userEmail ? deriveProfileKeyFromEmail(userEmail) : undefined;
  // Reviewer stamps under a retired login name the person behind them. Only
  // the roles that already see those stamps get the mapping.
  const legacyHandleGroups = roleMeetsFloor(role, "editor") || roleMeetsFloor(role, "translator")
    ? process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS ?? ""
    : "";

  return (
    <NextDevRouteClient
      initialTab={route.tab}
      initialSlug={route.slug}
      initialFilter={route.filter}
      initialProfileKey={initialProfileKey}
      ownedProfileKey={ownedProfileKey}
      legacyHandleGroups={legacyHandleGroups}
    />
  );
}
