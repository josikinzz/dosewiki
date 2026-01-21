import type { FieldMeta } from "@/data/schema";

interface TextareaFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
}

export function TextareaField({
  meta,
  value,
  onChange,
  disabled,
  rows = 4,
}: TextareaFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={meta.path}
        className="block text-sm font-medium text-white/80"
      >
        {meta.label}
        {meta.required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>
      <textarea
        id={meta.path}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={meta.placeholder}
        disabled={disabled}
        rows={rows}
        className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[16px] text-white placeholder-white/40 transition focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {meta.description && (
        <p className="text-xs text-white/50">{meta.description}</p>
      )}
    </div>
  );
}
