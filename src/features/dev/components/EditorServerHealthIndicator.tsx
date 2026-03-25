import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";

type EditorServerHealthIndicatorProps = {
  health: EditorServerConfigHealth;
  onRefresh: () => void;
};

function getAppearance(health: EditorServerConfigHealth) {
  if (health.status === "healthy") {
    return {
      icon: "lucide:badge-check",
      label: health.summary,
      className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (health.status === "unhealthy") {
    return {
      icon: "lucide:triangle-alert",
      label: health.summary,
      className: "border-rose-400/35 bg-rose-500/10 text-rose-200",
    };
  }

  if (health.status === "error") {
    return {
      icon: "lucide:wifi-off",
      label: health.summary,
      className: "border-amber-400/35 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    icon: "lucide:loader-circle",
    label: health.summary || "Checking server",
    className: "border-cyan-400/35 bg-cyan-500/10 text-cyan-200",
  };
}

export function EditorServerHealthIndicator({ health, onRefresh }: EditorServerHealthIndicatorProps) {
  if (health.status === "idle") {
    return null;
  }

  const appearance = getAppearance(health);
  const titleParts = [health.summary, ...health.issues];

  if (health.checkedAt) {
    titleParts.push(`Checked ${new Date(health.checkedAt).toLocaleTimeString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        title={titleParts.filter(Boolean).join(" • ")}
        className={cn(
          "inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]",
          appearance.className,
        )}
      >
        <Icon
          icon={appearance.icon}
          size={14}
          className={health.status === "checking" ? "animate-spin" : undefined}
        />
        <span className="truncate">{appearance.label}</span>
      </span>
      {(health.status === "unhealthy" || health.status === "error") && (
        <Button
          type="button"
          variant="ghostPill"
          size="chipXs"
          className="px-2.5 py-1 tracking-[0.2em]"
          onClick={onRefresh}
          disabled={health.isRefreshing}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
