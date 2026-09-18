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
      lineHeight: "1.25rem",
      color: "var(--theme-text-primary)",
      backgroundColor: "transparent",
    }),
    [minHeight],
  );

  const combinedClassName = [
    "json-editor theme-text-primary relative w-full overflow-x-hidden rounded-xl border border-[color:var(--editor-code-border)] bg-[var(--editor-code-bg)] shadow-[var(--theme-elevation-inner)]",
    readOnly ? "focus-within:border-[color:var(--theme-border-subtle)]" : "focus-within:border-[color:var(--theme-text-secondary)]",
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
        textareaClassName="theme-text-primary caret-[var(--editor-field-focus)] bg-transparent text-[16px] focus:outline-none md:text-sm"
        className="font-mono text-[16px] leading-5 md:text-sm"
        style={editorStyle}
        tabSize={2}
        insertSpaces
        readOnly={readOnly}
      />
    </div>
  );
}
