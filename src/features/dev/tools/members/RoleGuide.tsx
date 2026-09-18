import { Icon } from "@/components/common/Icon";
import { NestedContentCard } from "@/components/ui/surface";
import { getRoleDisplayName } from "@/lib/auth/roles";
import type { RoleDescription } from "@/lib/auth/roleDescriptions";

/**
 * One card per role: what it is, what it can do, what it cannot. Reads from
 * `ROLE_DESCRIPTIONS` so the Members tab, the invite form, and the invite
 * page never disagree about a role.
 */
export function RoleGuide({ roles }: { roles: readonly RoleDescription[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="Roles">
      {roles.map((entry) => (
        <NestedContentCard key={entry.role} padding="sm" role="listitem">
          <h4 className="text-sm font-semibold theme-text-primary">{getRoleDisplayName(entry.role)}</h4>
          <p className="theme-text-secondary mt-1 text-sm">{entry.summary}</p>
          <RoleList icon="lucide:check" label="Can" items={entry.can} />
          <RoleList icon="lucide:x" label="Cannot" items={entry.cannot} />
        </NestedContentCard>
      ))}
    </div>
  );
}

function RoleList({ icon, label, items }: { icon: string; label: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <span className="theme-text-faint block text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</span>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item} className="theme-text-secondary flex gap-2 text-sm">
            <Icon icon={icon} size={14} className="mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
