import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EditorNotice, EditorStatusPill } from "@/features/dev/components";
import { useQuote, type QuoteSection } from "@/hooks/useQuotes";
import type { SectionKey } from "@/data/config/sectionPrompts";
import { sectionKeyToPromptKey } from "@/data/config/promptRegistry";
import { usePromptWorkspaceDocument } from "@/features/dev/prompts/promptWorkspace";

interface PromptEditorModalProps {
  /** The section key for the prompt (e.g., "harm_potential") */
  sectionKey: SectionKey;
  /** The section label for display */
  sectionLabel: string;
  /** The user message (dynamically built, read-only) */
  userMessage: string;
  /** The substance slug for quote editing (optional) */
  substanceSlug?: string | null;
  /** The quote section type (optional, for quote editing) */
  quoteSection?: QuoteSection;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Username for attribution */
  username?: string;
}

export function PromptEditorModal({
  sectionKey,
  sectionLabel,
  userMessage,
  substanceSlug,
  quoteSection,
  onClose,
  username,
}: PromptEditorModalProps) {
  const promptDocument = usePromptWorkspaceDocument(sectionKeyToPromptKey(sectionKey));
  
  // Load quote if substance and section are provided
  const quoteResult = useQuote(
    substanceSlug ?? null,
    quoteSection ?? "harm_potential"
  );
  
  // Local state for editing
  const [editedQuote, setEditedQuote] = useState<string>("");
  const [quoteHasChanges, setQuoteHasChanges] = useState(false);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [saveQuoteSuccess, setSaveQuoteSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (quoteResult.content && !quoteHasChanges) {
      setEditedQuote(quoteResult.content);
    }
  }, [quoteResult.content, quoteHasChanges]);

  // Handle prompt changes
  const handlePromptChange = useCallback((value: string) => {
    promptDocument.setContent(value);
  }, [promptDocument]);

  // Handle quote changes
  const handleQuoteChange = useCallback((value: string) => {
    setEditedQuote(value);
    setQuoteHasChanges(value !== quoteResult.content);
    setSaveQuoteSuccess(false);
  }, [quoteResult.content]);

  // Save prompt to Convex
  const handleSavePrompt = useCallback(async () => {
    if (!promptDocument.hasChanges) return;

    setSaveError(null);

    try {
      await promptDocument.save(username);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save prompt");
    }
  }, [promptDocument, username]);

  // Save quote to Convex
  const handleSaveQuote = useCallback(async () => {
    if (!quoteHasChanges || !substanceSlug) return;
    
    setIsSavingQuote(true);
    setSaveError(null);
    
    try {
      await quoteResult.save(editedQuote, username);
      setQuoteHasChanges(false);
      setSaveQuoteSuccess(true);
      setTimeout(() => setSaveQuoteSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save quote");
    } finally {
      setIsSavingQuote(false);
    }
  }, [editedQuote, quoteHasChanges, quoteResult, substanceSlug, username]);

  // Format date for display
  const formatDate = (isoString?: string) => {
    if (!isoString) return null;
    try {
      return new Date(isoString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const promptSaveSuccess = promptDocument.saveStatus === "saved";
  const isSavingPrompt = promptDocument.saveStatus === "saving";
  const totalChars = promptDocument.content.length + userMessage.length + editedQuote.length;
  const showQuoteEditor = substanceSlug && quoteSection && quoteResult.content !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showClose={false}
        className="theme-editor-window z-[9999] flex h-[min(90vh,960px)] w-[min(100%,88rem)] max-w-6xl flex-col overflow-hidden rounded-2xl border p-0"
      >
        <DialogHeader className="theme-editor-titlebar flex shrink-0 flex-row items-center justify-between border-b px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            <div>
              <DialogTitle className="theme-text-primary font-medium">
              <Icon icon="lucide:file-code" className="mr-2 inline-block h-4 w-4" size={16} />
              Prompt editor — {sectionLabel}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Edit the system prompt, optional extracted quotes, and review the generated user message.
              </DialogDescription>
            </div>
            {(promptDocument.hasChanges || quoteHasChanges) && (
              <EditorStatusPill tone="warning" icon="lucide:circle-dot" live>
                Unsaved changes
              </EditorStatusPill>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              size="pill"
              onClick={() => setViewMode(viewMode === "edit" ? "preview" : "edit")}
            >
              <Icon icon="lucide:eye" className="h-3.5 w-3.5" size={14} />
              {viewMode === "edit" ? "Preview" : "Edit"}
            </Button>
            <Button
              variant="iconClose"
              onClick={onClose}
              title="Close"
            >
              <Icon icon="lucide:x" className="h-5 w-5" size={20} />
            </Button>
          </div>
        </DialogHeader>

        {saveError && (
          <div className="shrink-0 border-b border-[color:var(--theme-danger-border)] px-4 py-2">
            <EditorNotice
              notice={{
                tone: "danger",
                message: saveError,
                live: true,
                actions: (
                  <Button
                    variant="ghostDestructive"
                    size="icon"
                    onClick={() => setSaveError(null)}
                    aria-label="Dismiss error"
                  >
                    <Icon icon="lucide:x" className="h-4 w-4" size={16} />
                  </Button>
                ),
              }}
            />
          </div>
        )}

        <div className="flex-1 space-y-6 overflow-auto p-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="theme-accent-emphasis text-xs font-semibold uppercase tracking-wider">
                  System Prompt
                </span>
                <span className="theme-text-faint text-xs">
                  ({promptDocument.content.length.toLocaleString()} chars)
                </span>
                {promptDocument.exists && (
                  <EditorStatusPill tone="success">Convex</EditorStatusPill>
                )}
                {promptDocument.isLoading && (
                  <Icon icon="lucide:loader-2" className="theme-text-faint h-3 w-3 animate-spin" size={12} />
                )}
              </div>
              <div className="flex items-center gap-2">
                {promptDocument.attribution.updatedAt && (
                  <span className="theme-text-ghost text-xs">
                    Last saved: {formatDate(promptDocument.attribution.updatedAt)}
                    {promptDocument.attribution.updatedBy && ` by @${promptDocument.attribution.updatedBy}`}
                  </span>
                )}
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleSavePrompt}
                  disabled={!promptDocument.hasChanges || isSavingPrompt}
                >
                  {isSavingPrompt ? (
                    <Icon icon="lucide:loader-2" className="h-3.5 w-3.5 animate-spin" size={14} />
                  ) : promptSaveSuccess ? (
                    <Icon icon="lucide:check" className="h-3.5 w-3.5 text-[color:var(--theme-evidence-text)]" size={14} />
                  ) : (
                    <Icon icon="lucide:save" className="h-3.5 w-3.5" size={14} />
                  )}
                  {promptSaveSuccess ? "Saved!" : "Save Prompt"}
                </Button>
              </div>
            </div>
            {viewMode === "edit" ? (
              <Textarea
                value={promptDocument.content}
                onChange={(e) => handlePromptChange(e.target.value)}
                className="min-h-[250px] font-mono text-sm leading-relaxed resize-y"
                placeholder="Loading prompt..."
              />
            ) : (
              <pre className="theme-editor-pane theme-text-secondary max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg border p-4 font-mono text-sm leading-relaxed">
                {promptDocument.previewPayload.content}
              </pre>
            )}
          </div>

          {showQuoteEditor && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-evidence-text)]">
                    Extracted Quotes for "{substanceSlug}"
                  </span>
                  <span className="theme-text-faint text-xs">
                    ({editedQuote.length.toLocaleString()} chars)
                  </span>
                  {quoteResult.exists && (
                    <EditorStatusPill tone="success">Convex</EditorStatusPill>
                  )}
                  {quoteResult.isLoading && (
                    <Icon icon="lucide:loader-2" className="theme-text-faint h-3 w-3 animate-spin" size={12} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {quoteResult.updatedAt && (
                    <span className="theme-text-ghost text-xs">
                      Last saved: {formatDate(quoteResult.updatedAt)}
                      {quoteResult.updatedBy && ` by @${quoteResult.updatedBy}`}
                    </span>
                  )}
                  <Button
                    variant="glass"
                    size="pill"
                    onClick={handleSaveQuote}
                    disabled={!quoteHasChanges || isSavingQuote}
                  >
                    {isSavingQuote ? (
                      <Icon icon="lucide:loader-2" className="h-3.5 w-3.5 animate-spin" size={14} />
                    ) : saveQuoteSuccess ? (
                      <Icon icon="lucide:check" className="h-3.5 w-3.5 text-[color:var(--theme-evidence-text)]" size={14} />
                    ) : (
                      <Icon icon="lucide:save" className="h-3.5 w-3.5" size={14} />
                    )}
                    {saveQuoteSuccess ? "Saved!" : "Save Quotes"}
                  </Button>
                </div>
              </div>
              {viewMode === "edit" ? (
                <Textarea
                  value={editedQuote}
                  onChange={(e) => handleQuoteChange(e.target.value)}
                  className="min-h-[200px] font-mono text-sm leading-relaxed resize-y"
                  placeholder="Loading quotes..."
                />
              ) : (
                <pre className="theme-editor-pane theme-text-secondary max-h-[250px] overflow-auto whitespace-pre-wrap rounded-lg border p-4 font-mono text-sm leading-relaxed">
                  {editedQuote}
                </pre>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-article-route-active-text)]">
                User Message
              </span>
              <span className="theme-text-faint text-xs">
                ({userMessage.length.toLocaleString()} chars)
              </span>
              <span className="theme-text-ghost text-xs italic">
                (dynamically built, read-only)
              </span>
            </div>
            <pre className="theme-editor-pane theme-text-secondary max-h-[250px] overflow-auto whitespace-pre-wrap rounded-lg border p-4 font-mono text-sm leading-relaxed">
              {userMessage}
            </pre>
          </div>
        </div>

        <div className="theme-editor-statusbar flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs">
          <span>Total: {totalChars.toLocaleString()} characters</span>
          <span>
            {promptDocument.isLoading ? "Loading from Convex..." : promptDocument.exists ? "Loaded from Convex" : "Prompt not found in Convex"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
