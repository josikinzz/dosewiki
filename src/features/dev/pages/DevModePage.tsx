import { DevShortcutsProvider } from "../components/devShortcuts";
import { UnsavedWorkProvider } from "../components/unsavedWork";
import { useWriteFreezeObserver } from "../components/writeFreeze";
import { SessionDraftRecoveryProvider } from "../recovery/DraftRecoveryContext";
import { DevModePageView } from "./DevModePageView";
import type { DevModePageProps } from "./devModePageTypes";
import { useDevModePageController } from "./useDevModePageController";

function DevModePageContent(props: DevModePageProps) {
  const controller = useDevModePageController(props);
  useWriteFreezeObserver();
  return <DevModePageView controller={controller} />;
}

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
