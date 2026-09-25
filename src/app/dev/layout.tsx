import { AppProviders } from "../providers";
import { DEV_SCREENSHOT_VIEWER_AUTH_BASE_PATH } from "@server/auth/devScreenshotViewer";
import { getDevShellSession } from "@server/next/devShellSession";

export default async function DevLayout({ children }: { children: React.ReactNode }) {
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
