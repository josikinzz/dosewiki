import { DevShortcutsProvider } from "../components/devShortcuts";
import { UnsavedWorkProvider } from "../components/unsavedWork";
import { DevModePageView } from "./DevModePageView";
import type { DevModePageProps } from "./devModePageTypes";
import { useDevModePageController } from "./useDevModePageController";

function DevModePageContent(props: DevModePageProps) {
  const controller = useDevModePageController(props);
  return <DevModePageView controller={controller} />;
}

/**
 * The registries sit above the controller so the shell's own shared draft and
 * every tool below report into the one dialog the chrome consults, and every
 * tool's keys reach the one `?` sheet the chrome owns.
 */
export function DevModePage(props: DevModePageProps) {
  return (
    <UnsavedWorkProvider>
      <DevShortcutsProvider>
        <DevModePageContent {...props} />
      </DevShortcutsProvider>
    </UnsavedWorkProvider>
  );
}
