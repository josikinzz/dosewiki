import type { FormEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODEL_OPTIONS } from "@/utils/api/openrouter";

type SubstanceEditorApiSectionProps = {
  apiKey: string;
  apiKeyInput: string;
  apiKeySubmitLabel: string;
  isKeyValid: boolean | null;
  isValidatingKey: boolean;
  modelSelectId: string;
  onApiKeyInputChange: (value: string) => void;
  onApiKeySubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectedModelChange: (value: string) => void;
  openRouterCredentialHelpId: string;
  openRouterCredentialInputId: string;
  selectedModel: string;
  selectedModelContextWindow: number;
};

export function SubstanceEditorApiSection({
  apiKey,
  apiKeyInput,
  apiKeySubmitLabel,
  isKeyValid,
  isValidatingKey,
  modelSelectId,
  onApiKeyInputChange,
  onApiKeySubmit,
  onSelectedModelChange,
  openRouterCredentialHelpId,
  openRouterCredentialInputId,
  selectedModel,
  selectedModelContextWindow,
}: SubstanceEditorApiSectionProps) {
  const trimmedApiKeyInput = apiKeyInput.trim();

  return (
    <SectionCard delay={0.1}>
      <h2 className="theme-accent-heading mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon icon="lucide:bot" className="theme-icon-accent h-5 w-5" size={20} />
        API Configuration
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={openRouterCredentialInputId} className="theme-text-secondary mb-1.5 block text-sm font-medium">
            OpenRouter API Key
          </label>
          <form className="space-y-2" onSubmit={onApiKeySubmit}>
            <div className="relative">
              <Input
                id={openRouterCredentialInputId}
                type="password"
                value={apiKeyInput}
                onChange={(event) => onApiKeyInputChange(event.target.value)}
                placeholder="sk-or-..."
                className="pr-10"
                aria-describedby={openRouterCredentialHelpId}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isValidatingKey ? (
                  <Icon icon="lucide:loader-2" className="theme-text-faint h-4 w-4 animate-spin" size={16} />
                ) : isKeyValid === true ? (
                  <Icon icon="lucide:check" className="h-4 w-4 text-[color:var(--theme-evidence-text)]" size={16} />
                ) : isKeyValid === false ? (
                  <Icon icon="lucide:x" className="h-4 w-4 text-[color:var(--theme-danger-text)]" size={16} />
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={openRouterCredentialHelpId} className="theme-text-faint text-xs">
                Press Enter or {apiKeySubmitLabel.toLowerCase()} to apply this key for the current session.
              </p>
              <Button
                type="submit"
                variant="glass"
                size="pill"
                disabled={isValidatingKey || (!trimmedApiKeyInput && !apiKey)}
              >
                {apiKeySubmitLabel}
              </Button>
            </div>
          </form>
          <p className="theme-text-faint mt-1.5 text-xs">
            Get an API key from{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-link-muted"
            >
              openrouter.ai
            </a>
          </p>
        </div>
        <div>
          <label htmlFor={modelSelectId} className="theme-text-secondary mb-1.5 block text-sm font-medium">
            Model
          </label>
          <Select value={selectedModel} onValueChange={onSelectedModelChange}>
            <SelectTrigger id={modelSelectId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{model.label}</span>
                    <span className="theme-text-muted text-xs">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="theme-text-faint mt-1.5 text-xs">
            Context window: {selectedModelContextWindow.toLocaleString()} tokens
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
