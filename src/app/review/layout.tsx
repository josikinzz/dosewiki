import { AppProviders } from "../providers";
import { DEV_SCREENSHOT_VIEWER_AUTH_BASE_PATH } from "@server/auth/devScreenshotViewer";
import { getDevShellSession } from "@server/next/devShellSession";

/**
 * The review workbench needs the same client provider stack as the /dev shell
 * (Auth.js session, React Query): its controller calls `useSession`, which
 * throws without a mounted <SessionProvider />.
 *
 * It reads the session the way /dev does, so the local screenshot viewer
 * (loopback, `next dev`, opt-in and write freeze only; see
 * `lib/auth/devScreenshotViewer.ts`) can render it too. A real session always
 * wins, and every `/api/*` route keeps its own session and role check.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const { session, screenshotViewer } = await getDevShellSession();
  return (
    <AppProviders
      session={session}
      sessionBasePath={screenshotViewer ? DEV_SCREENSHOT_VIEWER_AUTH_BASE_PATH : undefined}
    >
      {children}
    </AppProviders>
  );
}
