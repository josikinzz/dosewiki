import type { IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";

type EditorServerHealthIndicatorProps = {
  health: EditorServerConfigHealth;
  onRefresh: () => void;
};

function getAppearance(health: EditorServerConfigHealth): {
  icon: IconName;
  label: string;
  tone: EditorStatusPillTone;
} {
  if (health.status === "healthy") {
    return {
      icon: "lucide:badge-check",
      label: health.summary,
      tone: "success",
    };
  }

  if (health.status === "unhealthy") {
    return {
      icon: "lucide:triangle-alert",
      label: health.summary,
      tone: "danger",
    };
  }

  if (health.status === "error") {
    return {
      icon: "lucide:wifi-off",
      label: health.summary,
      tone: "caution",
    };
  }

  return {
    icon: "lucide:loader-circle",
    label: health.summary || "Checking server",
    tone: "info",
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
      <EditorStatusPill
        tone={appearance.tone}
        icon={appearance.icon}
        loading={health.status === "checking"}
        live
        title={titleParts.filter(Boolean).join(" • ")}
        className="max-w-[14rem] uppercase tracking-[0.2em]"
      >
        <span className="truncate">{appearance.label}</span>
      </EditorStatusPill>
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
