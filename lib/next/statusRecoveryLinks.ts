import { getPublicHref, type PublicHrefIntent } from "@/utils/publicHref";

export type StatusRecoveryLinkKey = "substances" | "effects" | "reports";

export type StatusRecoveryLink = {
  key: StatusRecoveryLinkKey;
  label: string;
  href: string;
  intent: PublicHrefIntent;
};

const statusRecoveryLinkIntents = {
  substances: { type: "substances" },
  effects: { type: "effects" },
  reports: { type: "reports" },
} as const satisfies Record<StatusRecoveryLinkKey, PublicHrefIntent>;

const statusRecoveryLinkLabels = {
  substances: "Substances",
  effects: "Effects",
  reports: "Trip reports",
} as const satisfies Record<StatusRecoveryLinkKey, string>;

export function getStatusRecoveryLink(key: StatusRecoveryLinkKey): StatusRecoveryLink {
  const intent = statusRecoveryLinkIntents[key];
  return {
    key,
    label: statusRecoveryLinkLabels[key],
    href: getPublicHref(intent),
    intent,
  };
}
