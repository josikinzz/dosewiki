import { Icon } from "@/components/common/Icon";
import { Button, Input } from "@/components/ui";
import {
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
} from "@/features/dev/components";
import type { MoleculePickerItem } from "./moleculePickerOrdering";
import type { EditorMode, MoleculeClassTemplate } from "./moleculeEditorTypes";
import { SubstanceCombobox, TemplateInitialization } from "./MoleculeEditorPickers";

interface MoleculeEditorModePanelProps {
  mode: EditorMode;
  onModeChange: (mode: string) => void;
  pickerItems: MoleculePickerItem[] | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  loadTimedOut: boolean;
  loadedCount: number;
  overrideCount: number;
  publishedCount: number;
  noStructure: boolean;
  variant: "saved" | "auto" | "imported";
  loadedFromOverride: boolean;
  importableMolecules: MoleculePickerItem[] | null;
  importSlug: string | null;
  onImportSlugChange: (slug: string) => void;
  importing: boolean;
  saving: boolean;
  onImportStructure: () => void;
  pasteSmilesInput: string;
  onPasteSmilesInputChange: (smiles: string) => void;
  onImportSmiles: () => void;
  templateLoadError: string | null;
  overrideLoadError: string | null;
  templateDoc: MoleculeClassTemplate | null | undefined;
  source: string | null;
  templateSmilesInput: string;
  onTemplateSmilesInputChange: (smiles: string) => void;
  onInitializeTemplateFromClass: () => void;
  onInitializeTemplateFromSmiles: () => void;
  templateMemberItems: MoleculePickerItem[];
  templateMemberSlug: string | null;
  onTemplateMemberSlugChange: (slug: string) => void;
  onInitializeTemplateFromMember: () => void;
  templateMemberReady: boolean;
  classStructureReady: boolean;
  initializingTemplate: boolean;
  rendererReady: boolean;
  rendererError: string | null;
}

export function MoleculeEditorModePanel({
  mode,
  onModeChange,
  pickerItems,
  selected,
  onSelect,
  loadTimedOut,
  loadedCount,
  overrideCount,
  publishedCount,
  noStructure,
  variant,
  loadedFromOverride,
  importableMolecules,
  importSlug,
  onImportSlugChange,
  importing,
  saving,
  onImportStructure,
  pasteSmilesInput,
  onPasteSmilesInputChange,
  onImportSmiles,
  templateLoadError,
  overrideLoadError,
  templateDoc,
  source,
  templateSmilesInput,
  onTemplateSmilesInputChange,
  onInitializeTemplateFromClass,
  onInitializeTemplateFromSmiles,
  templateMemberItems,
  templateMemberSlug,
  onTemplateMemberSlugChange,
  onInitializeTemplateFromMember,
  templateMemberReady,
  classStructureReady,
  initializingTemplate,
  rendererReady,
  rendererError,
}: MoleculeEditorModePanelProps) {
  return (
    <EditorSection
      icon="lucide:hexagon"
      title="Molecule depiction editor"
      description="Edit saved molecule depictions, generic class structures, or private class orientation templates in one canvas. Template saves do not change public molecules."
      actions={<RendererStatus ready={rendererReady} error={rendererError} />}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <EditorSegmentedControl
          label="Molecule editor mode"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "substances", label: "Substances", icon: "lucide:pill" },
            { value: "classes", label: "Generic classes", icon: "lucide:hexagon" },
            { value: "templates", label: "Class templates", icon: "lucide:layout-template" },
          ]}
        />
        <SubstanceCombobox
          label={mode === "substances" ? "Select a substance" : "Select a class"}
          molecules={pickerItems}
          selected={selected}
          onSelect={onSelect}
          loadTimedOut={loadTimedOut}
          mode={mode}
        />
        {pickerItems ? (
          <p className="theme-text-muted text-xs">
            {mode === "templates"
              ? `${loadedCount} classes`
              : mode === "classes"
                ? `${loadedCount} classes · ${overrideCount} overrides`
                : `${loadedCount} substances · ${overrideCount} saved depictions · ${publishedCount} published articles`}
          </p>
        ) : null}
        {selected && !noStructure ? (
          <span className="theme-text-faint ml-auto text-xs">
            <span className="theme-text-muted font-mono">{selected}</span>
            {" · "}
            {variant === "imported"
              ? "imported structure, unsaved"
              : loadedFromOverride
                ? mode === "templates"
                  ? "saved template"
                  : mode === "classes"
                    ? "saved override"
                    : "saved depiction"
                : mode === "templates"
                  ? "new template"
                  : "unsaved auto layout"}
          </span>
        ) : null}
      </div>

      {selected ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
            {mode === "substances" ? "Start from another substance" : "Start from a saved structure"}
          </span>
          <SubstanceCombobox
            label="Select a structure to import"
            molecules={importableMolecules}
            selected={importSlug}
            onSelect={onImportSlugChange}
            loadTimedOut={loadTimedOut}
            mode="substances"
            placeholder="Import a saved structure…"
            searchPlaceholder="Search saved depictions…"
          />
          <Button
            variant="outline"
            onClick={onImportStructure}
            disabled={!importSlug || importing || saving}
            title="Replace the canvas with that saved drawing as a starting point"
          >
            <Icon icon={importing ? "lucide:loader-2" : "lucide:import"} size={15} className={importing ? "animate-spin" : undefined} />
            Load structure
          </Button>
          <span className="theme-text-faint text-xs">
            {mode === "substances"
              ? "Replaces the canvas. Good for drawing an analogue of an existing molecule."
              : mode === "templates"
                ? "Replaces the canvas; R-group placeholders are stripped so the template stays a plain scaffold."
                : "Replaces the canvas. Start the class drawing from any saved structure."}
          </span>
        </div>
      ) : null}

      {selected ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">Start from pasted SMILES</span>
          <Input
            value={pasteSmilesInput}
            onChange={(event) => onPasteSmilesInputChange(event.target.value)}
            placeholder="Paste SMILES…"
            aria-label="SMILES to load into the canvas"
            disabled={importing || saving}
            className="w-full sm:w-[22rem]"
          />
          <Button
            variant="outline"
            onClick={onImportSmiles}
            disabled={!pasteSmilesInput.trim() || importing || saving}
            title="Replace the canvas with an automatic layout of this SMILES"
          >
            <Icon icon={importing ? "lucide:loader-2" : "lucide:sparkles"} size={15} className={importing ? "animate-spin" : undefined} />
            Load SMILES
          </Button>
          <span className="theme-text-faint text-xs">Automatic layout: a starting point to tidy, not a finished drawing.</span>
        </div>
      ) : null}

      {mode === "templates" && selected && templateLoadError ? (
        <EditorNotice
          className="mt-4"
          notice={{ tone: "danger", title: "Couldn't load template", message: templateLoadError, live: true }}
        />
      ) : null}
      {mode !== "templates" && selected && overrideLoadError ? (
        <EditorNotice
          className="mt-4"
          notice={{ tone: "danger", title: "Couldn't load depiction", message: overrideLoadError, live: true }}
        />
      ) : null}
      {mode === "templates" && selected && templateDoc === null && !source && !templateLoadError ? (
        <TemplateInitialization
          onUseClassStructure={onInitializeTemplateFromClass}
          smiles={templateSmilesInput}
          onSmilesChange={onTemplateSmilesInputChange}
          onUseSmiles={onInitializeTemplateFromSmiles}
          members={templateMemberItems}
          selectedMember={templateMemberSlug}
          onSelectMember={onTemplateMemberSlugChange}
          onUseMember={onInitializeTemplateFromMember}
          memberReady={templateMemberReady}
          classStructureReady={classStructureReady}
          busy={initializingTemplate}
        />
      ) : null}
    </EditorSection>
  );
}

function RendererStatus({ ready, error }: { ready: boolean; error: string | null }) {
  if (error) {
    return <EditorStatusPill tone="danger" icon="lucide:circle-alert">renderer failed</EditorStatusPill>;
  }
  return ready ? (
    <EditorStatusPill tone="success" icon="lucide:check">renderer ready</EditorStatusPill>
  ) : (
    <EditorStatusPill tone="neutral" loading live>loading renderer</EditorStatusPill>
  );
}
