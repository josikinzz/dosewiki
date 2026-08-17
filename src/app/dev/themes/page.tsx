import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { isEffectIndex } from "@/config/siteFlavor";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Palette Lab",
  description: "Protected palette editor for the dose.wiki visual styles.",
  pathname: STATUS_PAGE_PATHS.dev,
});

export default async function DevThemesPage() {
  // Flavor gate first: the lab is an editor tool on a route Effect Index has no
  // /dev surface for, so on that build it does not exist. The page is dynamic, so
  // `notFound()` answers a real 404 rather than a prerendered soft one.
  if (isEffectIndex()) {
    notFound();
  }

  // The same session/decision/redirect policy every other /dev entry uses — no
  // second role policy for the lab. Middleware already turns anonymous and
  // viewer requests away; this is the in-page half of that gate.
  const session = await getServerSession(authOptions);
  const decision = getDevRouteDecision({
    pathname: STATUS_PAGE_PATHS.dev,
    email: session?.user?.email ?? null,
    role: session?.user?.role ?? null,
  });
  const redirectTarget = getProtectedRouteRedirectTarget(decision);

  if (redirectTarget.type === "sign-in" || redirectTarget.type === "unauthorized") {
    redirect(redirectTarget.href);
  }

  return <ThemeLabWorkbench />;
}
