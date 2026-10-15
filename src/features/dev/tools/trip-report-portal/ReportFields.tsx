"use client";

import { useRef } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";

type Subject = TripReportEditableFields["subject"];

const DETAIL_FIELDS: { key: Exclude<keyof Subject, "name" | "trip_date" | "setting" | "medications">; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "weight", label: "Weight" },
  { key: "height", label: "Height" },
];

export function TripDetailsFields({
  subject,
  onChange,
  idPrefix = "portal-report",
}: {
  subject: Subject;
  onChange: (next: Partial<Subject>) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <EditorField
          htmlFor={`${idPrefix}-trip-date`}
          label="Trip date"
          description="As YYYY-MM-DD when known."
        >
          <Input
            id={`${idPrefix}-trip-date`}
            value={subject.trip_date ?? ""}
            placeholder="2025-06-14"
            inputMode="numeric"
            className="tabular-nums"
            onChange={(event) => onChange({ trip_date: event.target.value })}
          />
        </EditorField>
        <EditorField htmlFor={`${idPrefix}-setting`} label="Setting">
          <Input
            id={`${idPrefix}-setting`}
            value={subject.setting ?? ""}
            onChange={(event) => onChange({ setting: event.target.value })}
          />
        </EditorField>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {DETAIL_FIELDS.map((field) => (
          <EditorField key={field.key} htmlFor={`${idPrefix}-${field.key}`} label={field.label}>
            <Input
              id={`${idPrefix}-${field.key}`}
              value={subject[field.key] ?? ""}
              onChange={(event) => onChange({ [field.key]: event.target.value })}
            />
          </EditorField>
        ))}
      </div>
      <EditorField htmlFor={`${idPrefix}-medications`} label="Medications">
        <Input
          id={`${idPrefix}-medications`}
          value={subject.medications ?? ""}
          onChange={(event) => onChange({ medications: event.target.value })}
        />
      </EditorField>
    </div>
  );
}

export function SubstancesField({
  substances,
  onChange,
  idPrefix = "portal-report",
}: {
  substances: TripReportEditableFields["substances"];
  onChange: (next: TripReportEditableFields["substances"]) => void;
  idPrefix?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const focusName = (index: number) =>
    requestAnimationFrame(() => {
      const target =
        rootRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${idPrefix}-substance-${index}-name`)}`) ??
        rootRef.current?.querySelector<HTMLElement>("[data-add-substance]");
      target?.focus();
    });

  const patchAt = (index: number, next: Partial<TripReportEditableFields["substances"][number]>) =>
    onChange(substances.map((entry, at) => (at === index ? { ...entry, ...next } : entry)));

  return (
    <div ref={rootRef} role="group" aria-labelledby={`${idPrefix}-substances-label`} className="space-y-3">
      <p id={`${idPrefix}-substances-label`} className="theme-text-muted text-sm font-medium leading-5">
        Substances
      </p>
      {substances.length === 0 ? (
        <p className="theme-text-faint text-sm">No substances listed.</p>
      ) : (
        <ol className="space-y-3">
          {substances.map((substance, index) => (
            <li key={index}>
              <fieldset className="theme-portal-rule min-w-0 rounded-card border px-3 pb-3 pt-2">
                <legend className="theme-text-faint px-1 text-xs font-medium">Substance {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <EditorField htmlFor={`${idPrefix}-substance-${index}-name`} label="Name">
                    <Input
                      id={`${idPrefix}-substance-${index}-name`}
                      aria-label={`Substance ${index + 1} name`}
                      value={substance.name}
                      onChange={(event) => patchAt(index, { name: event.target.value })}
                    />
                  </EditorField>
                  <EditorField htmlFor={`${idPrefix}-substance-${index}-dose`} label="Dose">
                    <Input
                      id={`${idPrefix}-substance-${index}-dose`}
                      aria-label={`Substance ${index + 1} dose`}
                      value={substance.dose ?? ""}
                      placeholder="75 µg"
                      onChange={(event) => patchAt(index, { dose: event.target.value })}
                    />
                  </EditorField>
                  <EditorField htmlFor={`${idPrefix}-substance-${index}-route`} label="Route">
                    <Input
                      id={`${idPrefix}-substance-${index}-route`}
                      aria-label={`Substance ${index + 1} route`}
                      value={substance.roa ?? ""}
                      placeholder="oral"
                      onChange={(event) => patchAt(index, { roa: event.target.value })}
                    />
                  </EditorField>
                  <Button
                    type="button"
                    variant="iconGhost"
                    size="icon"
                    className={cn("justify-self-end", TOUCH_ICON)}
                    aria-label={`Remove substance ${index + 1}`}
                    title="Remove substance"
                    onClick={() => {
                      onChange(substances.filter((_, at) => at !== index));
                      focusName(Math.min(index, substances.length - 2));
                    }}
                  >
                    <Icon icon="lucide:trash-2" size={16} />
                  </Button>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-add-substance=""
        onClick={() => {
          onChange([...substances, { name: "" }]);
          focusName(substances.length);
        }}
      >
        <Icon icon="lucide:plus" size={14} />
        Add a substance
      </Button>
    </div>
  );
}
