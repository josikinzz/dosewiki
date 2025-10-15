import { memo } from "react";

type DiffPreviewProps = {
  diffText: string;
  className?: string;
};

const getLineStyle = (line: string) => {
  if (line.startsWith("+")) {
    return "bg-emerald-500/10 text-emerald-300";
  }
  if (line.startsWith("-")) {
    return "bg-rose-500/15 text-rose-300";
  }
  if (line.startsWith("#")) {
    return "text-sky-300";
  }
  if (line.toLowerCase().includes("no differences detected")) {
    return "text-white/60 italic";
  }
  return "text-white/80";
};

const DiffPreviewComponent = ({ diffText, className }: DiffPreviewProps) => {
  const normalized = diffText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  return (
    <div className={`w-full overflow-auto rounded-xl border border-white/10 bg-slate-950/60 ${className ?? ""}`}>
      <pre className="m-0 whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <span
            key={`diff-line-${index}`}
            className={`block rounded px-2 py-0.5 ${getLineStyle(line)}`}
          >
            {line.length > 0 ? line : "\u00A0"}
          </span>
        ))}
      </pre>
    </div>
  );
};

export const DiffPreview = memo(DiffPreviewComponent);

