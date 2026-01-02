import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type UiJsonToggleMode = "ui" | "json";

export interface UiJsonToggleProps {
  mode: UiJsonToggleMode;
  onModeChange: (mode: UiJsonToggleMode) => void;
  className?: string;
  uiLabel?: string;
  jsonLabel?: string;
}

export function UiJsonToggle({
  mode,
  onModeChange,
  className,
  uiLabel = "UI view",
  jsonLabel = "JSON view",
}: UiJsonToggleProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as UiJsonToggleMode)}
      className={className}
    >
      <TabsList className="mx-auto">
        <TabsTrigger value="ui">{uiLabel}</TabsTrigger>
        <TabsTrigger value="json">{jsonLabel}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
