import { Badge } from "@/components/ui/badge";

const helperTextClass = "text-[11px] text-white/45";

type SectionHeaderProps = {
  title: string;
  description?: string;
};

type CharacterCountProps = {
  value: string;
};

type ListPreviewProps = {
  items: string[];
  emptyLabel: string;
};

export const SectionHeader = ({ title, description }: SectionHeaderProps) => (
  <div className="space-y-1">
    <h2 className="text-lg font-semibold text-fuchsia-200">{title}</h2>
    {description ? <p className="text-sm text-white/60">{description}</p> : null}
  </div>
);

export const CharacterCount = ({ value }: CharacterCountProps) => (
  <p className="text-[11px] text-right text-white/40">{value.length} characters</p>
);

export const ListPreview = ({ items, emptyLabel }: ListPreviewProps) => {
  if (items.length === 0) {
    return <p className={helperTextClass}>{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {items.map((item, index) => (
        <Badge
          key={`${item}-${index}`}
          variant="secondary"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
};

export { helperTextClass };
