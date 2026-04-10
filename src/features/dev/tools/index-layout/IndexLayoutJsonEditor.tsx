import { Button } from "@/components/ui/button";
import { JsonEditor } from "@/components/common/JsonEditor";
import { Icon } from "@/components/common/Icon";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium text-white/70">
        <span>{label}</span>
        <Button
          variant="glass"
          size="icon"
          onClick={onApply}
          className="bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30"
          aria-label="Apply JSON edits"
        >
          <Icon icon="lucide:check" className="h-4 w-4" size={16} />
        </Button>
      </div>
      <JsonEditor value={value} onChange={onChange} />
    </div>
  );
}
