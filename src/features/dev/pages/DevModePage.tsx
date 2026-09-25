import { DevShortcutsProvider } from "../components/devShortcuts";
import { UnsavedWorkProvider } from "../components/unsavedWork";
import { SessionDraftRecoveryProvider } from "../recovery/DraftRecoveryContext";
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
 * tool's keys reach the one `?` sheet the chrome owns. The draft recovery
 * store is keyed by the signed-in account, so every tool's browser copies
 * belong to whoever is signed in.
 */
export function DevModePage(props: DevModePageProps) {
  return (
    <SessionDraftRecoveryProvider>
      <UnsavedWorkProvider>
        <DevShortcutsProvider>
          <DevModePageContent {...props} />
        </DevShortcutsProvider>
      </UnsavedWorkProvider>
    </SessionDraftRecoveryProvider>
  );
}
