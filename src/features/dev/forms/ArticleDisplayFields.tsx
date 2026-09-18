"use client";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SubstancePriority } from "@/schema";

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", description: "Featured in listings" },
  { value: "normal", label: "Normal", description: "Standard visibility" },
  { value: "low", label: "Low", description: "Direct URL only" },
  { value: "hide_for_now", label: "Hide for now", description: "Temporarily direct URL only" },
] as const;

export function ArticleDisplayNameInput(props: ComponentProps<typeof Input>) {
  return <Input placeholder="Primary article title" {...props} />;
}
export function ArticlePrioritySelect({ id, value, onChange, disabled }: { id: string; value: SubstancePriority; onChange: (priority: SubstancePriority) => void; disabled?: boolean }) {
  return <Select value={value} onValueChange={(next) => onChange(next as SubstancePriority)} disabled={disabled}>
    <SelectTrigger id={id}><SelectValue placeholder="Select priority" /></SelectTrigger>
    <SelectContent>{PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}><div className="flex flex-col items-start"><span className="font-medium">{option.label}</span><span className="theme-text-faint text-xs">{option.description}</span></div></SelectItem>)}</SelectContent>
  </Select>;
}
