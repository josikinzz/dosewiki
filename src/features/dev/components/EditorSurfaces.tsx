import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { JsonEditor } from "./JsonEditor";
import { EditorNotice } from "./EditorNotice";
import { EditorPanel, EditorPanelBody, EditorPanelHeader } from "./EditorPanel";

type MaxHeightValue = number | string;

function maxHeightStyle(maxHeight?: MaxHeightValue): CSSProperties | undefined {
  if (maxHeight == null) {
    return undefined;
  }

  return {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
  };
}

export interface CodeSurfaceProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "title"> {
  title?: ReactNode;
  actions?: ReactNode;
  value?: string;
  children?: ReactNode;
  language?: string;
  maxHeight?: MaxHeightValue;
  emptyText?: ReactNode;
  wrap?: boolean;
  preClassName?: string;
  codeClassName?: string;
}

export function CodeSurface({
  title,
  actions,
  value,
  children,
  language,
  maxHeight,
  emptyText = "No content",
  wrap = true,
  className,
  preClassName,
  codeClassName,
  ...props
}: CodeSurfaceProps) {
  const content = children ?? value;
  const isEmpty = content == null || content === "";

  return (
    <div
      className={cn(
        "theme-text-secondary overflow-hidden rounded-xl border border-[color:var(--editor-code-border)] bg-[var(--editor-code-bg)]",
        className,
      )}
      {...props}
    >
      {(title || actions) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--editor-code-border)] px-3 py-2">
          {title ? (
            <div className="theme-text-faint text-xs font-medium uppercase tracking-[0.18em]">
              {title}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <pre
        className={cn(
          "m-0 overflow-auto p-3 font-mono text-xs leading-relaxed",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          preClassName,
        )}
        style={maxHeightStyle(maxHeight)}
      >
        <code className={codeClassName} data-language={language}>
          {isEmpty ? (
            <span className="theme-text-faint">{emptyText}</span>
          ) : (
            content
          )}
        </code>
      </pre>
    </div>
  );
}

export interface DiffSurfaceProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "title"> {
  title?: ReactNode;
  diffText: string;
  maxHeight?: MaxHeightValue;
  emptyText?: ReactNode;
  actions?: ReactNode;
}

function getDiffLineClassName(line: string) {
  if (line.startsWith("+")) {
    return "bg-[var(--editor-code-line-add-bg)] text-[var(--editor-code-line-add-text)]";
  }

  if (line.startsWith("-")) {
    return "bg-[var(--editor-code-line-remove-bg)] text-[var(--editor-code-line-remove-text)]";
  }

  if (line.startsWith("#")) {
    return "theme-accent-emphasis";
  }

  if (line.toLowerCase().includes("no differences detected")) {
    return "theme-text-faint italic";
  }

  return "theme-text-secondary";
}

export function DiffSurface({
  title,
  diffText,
  maxHeight,
  emptyText,
  actions,
  className,
  ...props
}: DiffSurfaceProps) {
  const normalized = diffText.replace(/\r\n/g, "\n");
  const lines = normalized ? normalized.split("\n") : [];

  if (lines.length === 0 && !emptyText) {
    return null;
  }

  return (
    <CodeSurface
      title={title}
      actions={actions}
      maxHeight={maxHeight}
      emptyText={emptyText}
      className={className}
      {...props}
    >
      {lines.length > 0
        ? lines.map((line, index) => (
            <span
              key={`diff-line-${index}`}
              className={cn("block rounded px-2 py-0.5", getDiffLineClassName(line))}
            >
              {line.length > 0 ? line : "\u00A0"}
            </span>
          ))
        : undefined}
    </CodeSurface>
  );
}

export interface JsonEditorPanelProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  value: string;
  error?: ReactNode;
  readOnly?: boolean;
  onChange?: (nextValue: string) => void;
  onApply?: () => void;
  applyLabel?: string;
  actions?: ReactNode;
  minHeight?: number;
  className?: string;
  editorClassName?: string;
}

export function JsonEditorPanel({
  id,
  title,
  description,
  value,
  error,
  readOnly = false,
  onChange,
  onApply,
  applyLabel = "Apply JSON edits",
  actions,
  minHeight,
  className,
  editorClassName,
}: JsonEditorPanelProps) {
  const headerActions =
    actions || onApply ? (
      <>
        {actions}
        {onApply ? (
          <Button
            variant="accent"
            size="icon"
            onClick={onApply}
            className="rounded-full"
            aria-label={applyLabel}
            disabled={readOnly}
          >
            <Icon icon="lucide:check" size={16} />
          </Button>
        ) : null}
      </>
    ) : undefined;

  return (
    <EditorPanel variant="subtle" className={className}>
      <EditorPanelHeader
        title={title}
        description={description}
        icon="lucide:braces"
        actions={headerActions}
      />
      <EditorPanelBody className="space-y-4">
        {error ? (
          <EditorNotice
            notice={{
              tone: "danger",
              message: error,
              live: true,
            }}
          />
        ) : null}
        <JsonEditor
          id={id}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          minHeight={minHeight}
          className={editorClassName}
        />
      </EditorPanelBody>
    </EditorPanel>
  );
}
