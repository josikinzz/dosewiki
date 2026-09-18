import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { KitCatalog } from "./KitCatalog";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "UI Kit",
  description: "Internal component catalog for the dose.wiki design system.",
  pathname: STATUS_PAGE_PATHS.dev,
});

export default async function DevKitPage() {
  const session = await getServerSession(authOptions);
  const decision = getDevRouteDecision({
    pathname: STATUS_PAGE_PATHS.dev,
    email: session?.user?.email ?? null,
    role: session?.user?.role ?? null,
    floor: "editor",
  });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in" || redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  return <KitCatalog />;
}
