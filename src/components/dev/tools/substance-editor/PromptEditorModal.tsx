import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSectionPrompt, type UsePromptResult } from "../../../../hooks/usePrompts";
import { useQuote, type QuoteSection } from "../../../../hooks/useQuotes";
import type { SectionKey } from "../../../../data/config/sectionPrompts";

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
  // Load prompt from Convex with fallback to static
  const promptResult = useSectionPrompt(sectionKey);
  
  // Load quote if substance and section are provided
  const quoteResult = useQuote(
    substanceSlug ?? null,
    quoteSection ?? "harm_potential"
  );
  
  // Local state for editing
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [editedQuote, setEditedQuote] = useState<string>("");
  const [promptHasChanges, setPromptHasChanges] = useState(false);
  const [quoteHasChanges, setQuoteHasChanges] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [savePromptSuccess, setSavePromptSuccess] = useState(false);
  const [saveQuoteSuccess, setSaveQuoteSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  // Initialize edited content when loaded
  useEffect(() => {
    if (promptResult.content && !promptHasChanges) {
      setEditedPrompt(promptResult.content);
    }
  }, [promptResult.content, promptHasChanges]);

  useEffect(() => {
    if (quoteResult.content && !quoteHasChanges) {
      setEditedQuote(quoteResult.content);
    }
  }, [quoteResult.content, quoteHasChanges]);

  // Handle prompt changes
  const handlePromptChange = useCallback((value: string) => {
    setEditedPrompt(value);
    setPromptHasChanges(value !== promptResult.content);
    setSavePromptSuccess(false);
  }, [promptResult.content]);

  // Handle quote changes
  const handleQuoteChange = useCallback((value: string) => {
    setEditedQuote(value);
    setQuoteHasChanges(value !== quoteResult.content);
    setSaveQuoteSuccess(false);
  }, [quoteResult.content]);

  // Save prompt to Convex
  const handleSavePrompt = useCallback(async () => {
    if (!promptHasChanges) return;
    
    setIsSavingPrompt(true);
    setSaveError(null);
    
    try {
      await promptResult.save(editedPrompt, username);
      setPromptHasChanges(false);
      setSavePromptSuccess(true);
      setTimeout(() => setSavePromptSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save prompt");
    } finally {
      setIsSavingPrompt(false);
    }
  }, [editedPrompt, promptHasChanges, promptResult, username]);

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

  const totalChars = editedPrompt.length + userMessage.length + editedQuote.length;
  const showQuoteEditor = substanceSlug && quoteSection && quoteResult.content !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-b from-[#1a1030] via-[#130e2b] to-[#0f0a1f] shadow-2xl shadow-fuchsia-500/10">
        {/* Window Title Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Window controls (decorative) */}
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-fuchsia-500/60" />
              <div className="h-3 w-3 rounded-full bg-violet-500/60" />
              <div className="h-3 w-3 rounded-full bg-purple-500/60" />
            </div>
            <span className="font-medium text-white">
              <Icon icon="lucide:file-code" className="mr-2 inline-block h-4 w-4" size={16} />
              {sectionLabel} - Prompt Editor
            </span>
            {(promptHasChanges || quoteHasChanges) && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                Unsaved changes
              </span>
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
        </div>

        {/* Error Banner */}
        {saveError && (
          <div className="shrink-0 flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            <Icon icon="lucide:alert-circle" className="h-4 w-4" size={16} />
            {saveError}
            <button
              type="button"
              className="ml-auto text-red-300 hover:text-red-200"
              onClick={() => setSaveError(null)}
            >
              <Icon icon="lucide:x" className="h-4 w-4" size={16} />
            </button>
          </div>
        )}

        {/* Window Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* System Prompt Section */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">
                  System Prompt
                </span>
                <span className="text-xs text-white/40">
                  ({editedPrompt.length.toLocaleString()} chars)
                </span>
                {promptResult.exists && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    Convex
                  </span>
                )}
                {promptResult.isLoading && (
                  <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin text-white/40" size={12} />
                )}
              </div>
              <div className="flex items-center gap-2">
                {promptResult.updatedAt && (
                  <span className="text-xs text-white/30">
                    Last saved: {formatDate(promptResult.updatedAt)}
                    {promptResult.updatedBy && ` by @${promptResult.updatedBy}`}
                  </span>
                )}
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleSavePrompt}
                  disabled={!promptHasChanges || isSavingPrompt}
                >
                  {isSavingPrompt ? (
                    <Icon icon="lucide:loader-2" className="h-3.5 w-3.5 animate-spin" size={14} />
                  ) : savePromptSuccess ? (
                    <Icon icon="lucide:check" className="h-3.5 w-3.5 text-emerald-400" size={14} />
                  ) : (
                    <Icon icon="lucide:save" className="h-3.5 w-3.5" size={14} />
                  )}
                  {savePromptSuccess ? "Saved!" : "Save Prompt"}
                </Button>
              </div>
            </div>
            {viewMode === "edit" ? (
              <Textarea
                value={editedPrompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                className="min-h-[250px] font-mono text-sm leading-relaxed resize-y"
                placeholder="Loading prompt..."
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20 p-4 font-mono text-sm leading-relaxed text-white/80 max-h-[300px] overflow-auto">
                {editedPrompt}
              </pre>
            )}
          </div>

          {/* Quote Editor Section (only if substance is selected) */}
          {showQuoteEditor && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    Extracted Quotes for "{substanceSlug}"
                  </span>
                  <span className="text-xs text-white/40">
                    ({editedQuote.length.toLocaleString()} chars)
                  </span>
                  {quoteResult.exists && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                      Convex
                    </span>
                  )}
                  {quoteResult.isLoading && (
                    <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin text-white/40" size={12} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {quoteResult.updatedAt && (
                    <span className="text-xs text-white/30">
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
                      <Icon icon="lucide:check" className="h-3.5 w-3.5 text-emerald-400" size={14} />
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
                <pre className="whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4 font-mono text-sm leading-relaxed text-white/80 max-h-[250px] overflow-auto">
                  {editedQuote}
                </pre>
              )}
            </div>
          )}

          {/* User Message Section (read-only) */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                User Message
              </span>
              <span className="text-xs text-white/40">
                ({userMessage.length.toLocaleString()} chars)
              </span>
              <span className="text-xs text-white/30 italic">
                (dynamically built, read-only)
              </span>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 font-mono text-sm leading-relaxed text-white/80 max-h-[250px] overflow-auto">
              {userMessage}
            </pre>
          </div>
        </div>

        {/* Window Status Bar */}
        <div className="shrink-0 border-t border-fuchsia-500/20 bg-fuchsia-950/30 px-4 py-2 flex items-center justify-between text-xs text-white/40">
          <span>Total: {totalChars.toLocaleString()} characters</span>
          <span>
            {promptResult.isLoading ? "Loading from Convex..." : promptResult.exists ? "Loaded from Convex" : "Prompt not found in Convex"}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
