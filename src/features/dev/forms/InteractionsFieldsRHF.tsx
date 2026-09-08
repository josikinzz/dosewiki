import { useFormContext, useWatch } from "react-hook-form";
import type { SubstanceArticle } from "@/schema";
import { Icon } from "@/components/common/Icon";
import { EditorStatusPill } from "@/features/dev/components";
import { TextListInput } from "./rhf";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";

export function InteractionsFieldsRHF({ embedded = false }: { embedded?: boolean }) {
  const { control } = useFormContext<SubstanceArticle>();
  const interactions = useWatch({ control, name: "interactions" });
  const helperText = embedded ? "Add one entry at a time. Enter adds it; Shift+Enter starts a new line." : undefined;
  return (
    <section className="space-y-4">
      <CollapsibleEditorCard
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
        count={embedded ? interactions?.dangerous?.length ?? 0 : undefined}
        title="Dangerous Combinations"
        icon={<Icon icon="lucide:skull" className="h-5 w-5" size={20} />}
        badge={embedded ? undefined :
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
          embedded={embedded}
          helperText={helperText}
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
        count={embedded ? interactions?.unsafe?.length ?? 0 : undefined}
        title="Unsafe Combinations"
        icon={<Icon icon="lucide:hospital" className="h-5 w-5" size={20} />}
        badge={embedded ? undefined :
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
          embedded={embedded}
          helperText={helperText}
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
        count={embedded ? interactions?.caution?.length ?? 0 : undefined}
        title="Use with Caution"
        icon={<Icon icon="lucide:triangle-alert" className="h-5 w-5" size={20} />}
        badge={embedded ? undefined :
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
          embedded={embedded}
          helperText={helperText}
        />
      </CollapsibleEditorCard>
    </section>
  );
}
