import type { FieldMeta } from "@/data/schema";

interface DurationFieldProps {
  meta: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Input field for duration stages.
 * Accepts human-friendly formats like "15-30 minutes", "2-4 hours"
 * Transformer handles conversion to/from schema format { min, max, unit }
 */
export function DurationField({
  meta,
  value,
  onChange,
  disabled,
}: DurationFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={meta.path}
        className="block text-sm font-medium text-white/80"
      >
        {meta.label}
        {meta.required && <span className="ml-1 text-fuchsia-400">*</span>}
      </label>
      <input
        id={meta.path}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={meta.placeholder || "e.g., 15-30 minutes"}
        disabled={disabled}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[16px] text-white placeholder-white/40 transition focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {meta.description && (
        <p className="text-xs text-white/50">{meta.description}</p>
      )}
    </div>
  );
}
