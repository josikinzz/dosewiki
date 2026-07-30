import { Icon } from "@/components/common/Icon";
import { EditorStatusPill } from "@/features/dev/components";
import { TextListInput } from "./rhf";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";

export function InteractionsFieldsRHF() {
  return (
    <section className="space-y-4">
      <CollapsibleEditorCard
        density="compact"
        title="Dangerous Combinations"
        icon={<Icon icon="lucide:skull" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="danger" icon="lucide:skull" data-badge-tone="red">
            Dangerous
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.dangerous"
          label="Dangerous"
          placeholder="e.g., Alcohol (Both substances cause...)"
          addButtonLabel="Add dangerous"
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        title="Unsafe Combinations"
        icon={<Icon icon="lucide:hospital" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="warning" icon="lucide:hospital" data-badge-tone="orange">
            Unsafe
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.unsafe"
          label="Unsafe"
          placeholder="e.g., Opioids (Risk of respiratory...)"
          addButtonLabel="Add unsafe"
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        title="Use with Caution"
        icon={<Icon icon="lucide:triangle-alert" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="warning" icon="lucide:triangle-alert">
            Caution
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.caution"
          label="Caution"
          placeholder="e.g., Cannabis (May intensify...)"
          addButtonLabel="Add caution"
        />
      </CollapsibleEditorCard>
    </section>
  );
}
