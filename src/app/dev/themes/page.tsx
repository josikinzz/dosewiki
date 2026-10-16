import { redirect } from "next/navigation";
import { getDevShellSession } from "@server/next/devShellSession";
import {
  buildNoIndexPageMetadata,
  getProtectedRouteRedirectTarget,
  STATUS_PAGE_PATHS,
} from "@server/next/statusRedirectPolicy";
import { getDevRouteDecision } from "@/lib/auth/roles";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

export const dynamic = "force-dynamic";
export const metadata = buildNoIndexPageMetadata({
  title: "Theme Lab",
  description: "Protected theme editor for the dose.wiki visual styles.",
  pathname: STATUS_PAGE_PATHS.dev,
});

export default async function DevThemesPage() {
  const { session } = await getDevShellSession();
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

  return <ThemeLabWorkbench />;
}
