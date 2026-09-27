import { useFormContext, useWatch } from "react-hook-form";
import type { SubstanceArticle } from "@/schema";
import { Icon } from "@/components/common/Icon";
import { EditorStatusPill } from "@/features/dev/components";
import { TextListInput } from "./rhf";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
import { interactionOverlaps, INTERACTION_TIER_LABELS } from "./interactionChecks";

export function InteractionsFieldsRHF({ embedded = false }: { embedded?: boolean }) {
  const { control } = useFormContext<SubstanceArticle>();
  const interactions = useWatch({ control, name: "interactions" });
  const helperText = embedded ? "One substance per entry, with the reason in brackets: Alcohol (both depress breathing). Enter adds it; Shift+Enter starts a new line." : undefined;
  const overlaps = embedded ? interactionOverlaps(interactions) : [];
  return (
    <section className="space-y-4">
      <CollapsibleEditorCard
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
        defaultExpanded={embedded}
        count={embedded ? interactions?.dangerous?.length ?? 0 : undefined}
        iconClassName={embedded ? "text-[color:var(--theme-semantic-danger-badge-text)]" : undefined}
        title={embedded ? "Dangerous combinations" : "Dangerous Combinations"}
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
        defaultExpanded={embedded}
        count={embedded ? interactions?.unsafe?.length ?? 0 : undefined}
        iconClassName={embedded ? "text-[color:var(--theme-semantic-unsafe-badge-text)]" : undefined}
        title={embedded ? "Unsafe combinations" : "Unsafe Combinations"}
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
        defaultExpanded={embedded}
        count={embedded ? interactions?.caution?.length ?? 0 : undefined}
        iconClassName={embedded ? "text-[color:var(--theme-semantic-caution-badge-text)]" : undefined}
        title={embedded ? "Use with caution" : "Use with Caution"}
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
      {overlaps.length > 0 ? (
        <ul role="status" className="space-y-1.5">
          {overlaps.map((overlap) => (
            <li key={overlap.name} className="theme-warning-text flex items-start gap-2 text-sm">
              <Icon icon="lucide:triangle-alert" size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {overlap.label} is listed under {overlap.tiers.map((tier) => INTERACTION_TIER_LABELS[tier]).join(" and ")}. Keep it in the one tier that fits.
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
