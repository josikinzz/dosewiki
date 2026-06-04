import { JsonEditorPanel } from "@/features/dev/components";

type IndexLayoutJsonEditorProps = {
  label: string;
  value: string;
  onApply: () => void;
  onChange: (nextValue: string) => void;
};

export function IndexLayoutJsonEditor({
  label,
  value,
  onApply,
  onChange,
}: IndexLayoutJsonEditorProps) {
  return (
    <JsonEditorPanel
      title={label}
      value={value}
      onApply={onApply}
      onChange={onChange}
    />
  );
}
