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

export const metadata = buildNoIndexPageMetadata({
  title: "Dev",
  description: "Protected editor surface for the Next.js migration shell.",
  pathname: STATUS_PAGE_PATHS.dev,
});

type DevPageProps = {
  params: Promise<{
    segments?: string[];
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NextDevPage({ params, searchParams }: DevPageProps) {
  const [tabSegment, slugSegment, nestedSegment] = (await params).segments ?? [];
  const route = resolveDevRoute(tabSegment, slugSegment, await searchParams, nestedSegment);

  const destination = findDevTab(route.tab).destination;
  if (destination.kind === "external") {
    redirect(route.slug ? `${destination.href}/${route.slug}` : destination.href);
  }
  const { session, screenshotViewer } = await getDevShellSession();
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;
  const decision = getDevRouteDecision({ pathname: STATUS_PAGE_PATHS.dev, email, role });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in") {
    redirect(redirectTarget.href);
  }

  if (redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

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
  const ownedProfileKey = userEmail && !screenshotViewer
    ? getOwnedContributorProfileKey(userEmail)
        .catch((error: unknown) => {
          console.error("Unable to resolve the owned contributor profile; rendering the /dev shell without it.", error);
          return null;
        })
    : undefined;
  const initialProfileKey = userEmail ? deriveProfileKeyFromEmail(userEmail) : undefined;
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
