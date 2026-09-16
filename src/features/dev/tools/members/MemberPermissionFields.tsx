"use client";

import { EditorCheckbox } from "@/features/dev/components";
import { managedRoleFor, roleMeetsFloor, type AppRole, type ManagedRole } from "@/lib/auth/roles";
import translationLocaleNames from "@/i18n/translationLocaleNames.json";

export function MemberPermissionFields({ role, glossaryLocales, onChange, disabled, label }: {
  role: AppRole;
  glossaryLocales: readonly string[];
  onChange: (role: ManagedRole, glossaryLocales: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const editor = roleMeetsFloor(role, "editor");
  const translator = roleMeetsFloor(role, "translator");
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3" aria-label={label}>
      <legend className="theme-text-secondary text-xs font-medium">Roles</legend>
      <div className="flex flex-wrap gap-3">
        <EditorCheckbox label="Editor" checked={editor} onChange={(event) => onChange(managedRoleFor(event.target.checked, translator), [...glossaryLocales])} />
        <EditorCheckbox label="Translator" checked={translator} onChange={(event) => onChange(managedRoleFor(editor, event.target.checked), event.target.checked ? [...glossaryLocales] : [])} />
      </div>
      {translator ? (
        <fieldset className="space-y-2">
          <legend className="theme-text-secondary text-xs font-medium">Approved glossary languages</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(translationLocaleNames).map(([locale, name]) => (
              <EditorCheckbox key={locale} label={`${name} (${locale})`} checked={glossaryLocales.includes(locale)} onChange={(event) => onChange(managedRoleFor(editor, translator), event.target.checked ? [...glossaryLocales, locale] : glossaryLocales.filter((value) => value !== locale))} />
            ))}
          </div>
          {glossaryLocales.length === 0 && <p className="theme-text-secondary text-xs">Choose at least one language before saving.</p>}
        </fieldset>
      ) : <p className="theme-text-faint text-xs">Neither role selected grants Contributor access only.</p>}
    </fieldset>
  );
}
