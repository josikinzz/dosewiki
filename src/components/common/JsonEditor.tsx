import { useMemo, type CSSProperties } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";

export type JsonEditorProps = {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  minHeight?: number;
  className?: string;
  readOnly?: boolean;
};

const highlightJson = (code: string) => Prism.highlight(code, Prism.languages.json, "json");

export function JsonEditor({ id, value, onChange, minHeight = 360, className, readOnly = false }: JsonEditorProps) {
  const editorStyle = useMemo<CSSProperties>(
    () => ({
      minHeight,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 16,
      lineHeight: "1.25rem",
      color: "rgba(248, 250, 252, 0.95)",
      backgroundColor: "transparent",
    }),
    [minHeight],
  );

  const combinedClassName = [
    "json-editor relative w-full overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/60 text-white shadow-inner",
    "focus-within:border-fuchsia-400 focus-within:ring-1 focus-within:ring-fuchsia-300",
    readOnly ? "focus-within:border-white/8 focus-within:ring-0" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleValueChange = (next: string) => {
    if (!readOnly && onChange) {
      onChange(next);
    }
  };

  return (
    <div className={combinedClassName}>
      <Editor
        value={value}
        onValueChange={handleValueChange}
        highlight={highlightJson}
        padding={16}
        textareaId={id}
        textareaClassName="caret-fuchsia-300 bg-transparent text-white focus:outline-none"
        className="font-mono text-[16px] leading-5"
        style={editorStyle}
        tabSize={2}
        insertSpaces
        readOnly={readOnly}
      />
    </div>
  );
}
