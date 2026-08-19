import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
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
  if (isEffectIndex()) {
    notFound();
  }

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
