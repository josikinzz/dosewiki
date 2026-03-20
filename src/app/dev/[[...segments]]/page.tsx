import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import { buildPageMetadata } from "@server/next/metadata";
import { publicConvexUrl } from "../../../../lib/runtime/publicEnv";
import { canAccessDev } from "@/lib/auth/roles";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";
import type { DevTab } from "@/types/navigation";

export const dynamic = "force-dynamic";
export const metadata = buildPageMetadata({
  title: "Dev",
  description: "Protected editor surface for the Next.js migration shell.",
  pathname: "/dev",
  noIndex: true,
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

  return { tab: "articles", slug };
}

export default async function NextDevPage({ params }: DevPageProps) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const role = session?.user?.role ?? null;

  if (!email) {
    redirect("/sign-in?callbackUrl=%2Fdev");
  }

  if (!canAccessDev(role)) {
    redirect("/unauthorized?from=%2Fdev");
  }

  const resolvedParams = await params;
  const route = resolveDevRoute(resolvedParams.segments);
  const convexUrl = publicConvexUrl ?? null;

  return (
    <NextDevRouteClient
      convexUrl={convexUrl}
      initialTab={route.tab}
      initialSlug={route.slug}
    />
  );
}
