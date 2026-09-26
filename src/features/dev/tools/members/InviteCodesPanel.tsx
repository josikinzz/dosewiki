"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  Notice,
  EditorField,
  EditorPanel,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  useConfirm,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { languageNames } from "@/features/language-glossary/languageGlossary";
import { getRoleDisplayName, parseGlossaryLocaleGrant, roleMeetsFloor } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { LINK_LIST_CLASS, RelativeDay, RowSkeletons } from "../home/homeParts";
import { countNoun } from "../home/homeModel";
import {
  fetchInviteCodes,
  mintInviteCode,
  revokeInviteCode,
  type InviteCodeRole,
  type InviteCodeStatus,
  type InviteCodeSummary,
  type MintedInvite,
} from "./inviteCodeRequests";
import { MemberPermissionFields } from "./MemberPermissionFields";
import { composeInviteMessage } from "./inviteMessage";

type CopyTarget = "code" | "link" | "message";
type HistoryFilter = "all" | "active";

const COPY_LABEL: Record<CopyTarget, string> = {
  code: "Copy code",
  link: "Copy link",
  message: "Copy message",
};

const STATUS_TONE: Record<InviteCodeStatus, EditorStatusPillTone> = {
  active: "success",
  expired: "neutral",
  exhausted: "info",
  revoked: "danger",
};

const STATUS_LABEL: Record<InviteCodeStatus, string> = {
  active: "Active",
  expired: "Expired",
  exhausted: "Used",
  revoked: "Revoked",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/**
 * What a code created now would grant, in one sentence ("Creates a single-use
 * Editor invite that closes Jan 22, 2026."), or null for a value the route
 * refuses.
 */
export function describeInviteTerms(
  role: InviteCodeRole,
  glossaryLocales: readonly string[],
  expiresInDays: string,
  maxUses: string,
  now: number = Date.now(),
): string | null {
  const days = Number(expiresInDays);
  const uses = Number(maxUses);
  if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(uses) || uses < 1 || uses > 100) return null;
  const closes = formatDate(new Date(now + days * 86_400_000).toISOString());
  const languages = roleMeetsFloor(role, "translator") && glossaryLocales.length > 0 ? ` for ${languageNames([...glossaryLocales])}` : "";
  const reach = uses === 1 ? "a single-use" : `a ${uses}-use`;
  return `Creates ${reach} ${getRoleDisplayName(role)} invite${languages} that closes ${closes}.`;
}

type PanelNotice = { tone: "success" | "danger"; message: string };
const mergeUniqueInvites = (
  current: InviteCodeSummary[],
  incoming: InviteCodeSummary[],
) => {
  const incomingById = new Map(incoming.map((invite) => [invite.id, invite]));
  const merged = current.map((invite) => incomingById.get(invite.id) ?? invite);
  const existingIds = new Set(current.map((invite) => invite.id));
  for (const invite of incoming) {
    if (!existingIds.has(invite.id)) merged.push(invite);
  }
  return merged;
};

/** A refused write under the freeze reads as the freeze, not as the route's own words. */
const FROZEN_WRITE = "Writes are paused, so that was not saved.";
const isFrozenMessage = (message: string) => /frozen|writes are paused/i.test(message);

export type InviteCodesPanelProps = {
  /** A note to start the form with (People's "Invite them instead"); a new token refills it. */
  prefillNote?: { text: string; token: number } | null;
  /** Opens the member an address belongs to; returns false when there is none. */
  onOpenMember?: (email: string) => boolean;
  /** A member's name for an address ("river", "you"); addresses show as they are without it. */
  nameOf?: (email: string) => string;
  /** How many codes are open, once the first page loads (null while unknown). */
  onActiveCountChange?: (count: number | null) => void;
};

/**
 * People's Invites view: create a code on the left, see its plaintext exactly
 * once with a ready-to-paste message, and manage the codes already issued on
 * the right. History loads one page at a time on request. Self-contained: it
 * loads its own data from `/api/dev/invites`, so it mounts without props.
 */
export default function InviteCodesPanel({ nameOf, onActiveCountChange, prefillNote, onOpenMember }: InviteCodesPanelProps = {}) {
  const [invites, setInvites] = useState<InviteCodeSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [continuationCursor, setContinuationCursor] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const loadGeneration = useRef(0);
  // Contributor until the admin ticks a role: an invite never grants more than was chosen.
  const [role, setRole] = useState<InviteCodeRole>("contributor");
  const [glossaryLocales, setGlossaryLocales] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [maxUses, setMaxUses] = useState("1");
  const [isMinting, setIsMinting] = useState(false);
  const [mintNotice, setMintNotice] = useState<PanelNotice | null>(null);
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [anyCopied, setAnyCopied] = useState(false);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<PanelNotice | null>(null);
  const { frozen } = useWriteFreeze();
  const { confirm, dialog } = useConfirm();
  const revealRef = useRef<HTMLHeadingElement | null>(null);
  const headingId = useId();
  const formHeadingId = useId();
  const nameFor = (email: string) => (nameOf ? nameOf(email) : email);

  /** Loads the next page of history; the admin asks for each one. */
  const loadContinuation = useCallback(async function loadContinuation(
    cursor: string,
    generation: number,
  ): Promise<void> {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const page = await fetchInviteCodes(cursor);
      if (loadGeneration.current !== generation) return;
      setInvites((current) => mergeUniqueInvites(current ?? [], page.invites));
      setContinuationCursor(page.continuationCursor);
      setIsLoadingHistory(false);
    } catch (error) {
      if (loadGeneration.current !== generation) return;
      setHistoryError(
        error instanceof Error ? error.message : "Unable to load invite code history.",
      );
      setIsLoadingHistory(false);
    }
  }, []);

  const reload = useCallback(async (preserveCurrent = false) => {
    const generation = ++loadGeneration.current;
    if (!preserveCurrent) setInvites(null);
    setLoadError(null);
    setHistoryError(null);
    setContinuationCursor(null);
    setIsLoadingHistory(true);
    try {
      const page = await fetchInviteCodes();
      if (loadGeneration.current !== generation) return;
      setInvites(page.invites);
      setContinuationCursor(page.continuationCursor);
      setIsLoadingHistory(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load invite codes.";
      if (preserveCurrent) {
        setHistoryError(message);
      } else {
        setLoadError(message);
      }
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      loadGeneration.current += 1;
    };
  }, [reload]);

  const activeCount = invites === null ? null : invites.filter((invite) => invite.status === "active").length;
  useEffect(() => {
    onActiveCountChange?.(loadError ? null : activeCount);
  }, [activeCount, loadError, onActiveCountChange]);

  useEffect(() => {
    if (!prefillNote) return;
    setNote(prefillNote.text);
    noteRef.current?.focus({ preventScroll: true });
  }, [prefillNote]);

  // The plaintext is shown once: bring it into view (phones stack the list under the form) and put focus on it.
  useEffect(() => {
    if (minted) revealRef.current?.focus({ preventScroll: false });
  }, [minted]);

  // A Contributor code is the smallest grant and creates at once; anything
  // above it asks first and names exactly what the code will create.
  const handleMint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (role === "contributor") {
      void mint();
      return;
    }
    confirm({
      title: `Create ${getRoleDisplayName(role)} invite code?`,
      description: `${describeInviteTerms(role, glossaryLocales, expiresInDays, maxUses) ?? `Creates a ${getRoleDisplayName(role)} invite.`} Whoever redeems it gets ${getRoleDisplayName(role)} access${note.trim() ? ` (note: ${note.trim()})` : ""}.`,
      confirmLabel: "Create invite code",
      onConfirm: () => mint(),
    });
  };

  const mint = async () => {
    setMintNotice(null);
    setIsMinting(true);
    try {
      const result = await mintInviteCode({
        role,
        glossaryLocales: parseGlossaryLocaleGrant(role, glossaryLocales),
        note: note.trim() || undefined,
        expiresInDays: Number(expiresInDays),
        maxUses: Number(maxUses),
      });
      setMinted(result);
      setCopied(null);
      setCopyFailed(false);
      setAnyCopied(false);
      setConfirmingDismiss(false);
      setNote("");
      setInvites((current) => [result.invite, ...(current ?? [])]);
      void reload(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create an invite code.";
      setMintNotice({ tone: "danger", message: isFrozenMessage(message) || frozen ? FROZEN_WRITE : message });
    } finally {
      setIsMinting(false);
    }
  };

  const inviteUrl = minted
    ? `${typeof window === "undefined" ? "" : window.location.origin}/invite?code=${encodeURIComponent(minted.code)}`
    : "";

  const inviteMessage = minted
    ? composeInviteMessage({ invite: minted.invite, code: minted.code, url: inviteUrl })
    : "";

  const copy = async (kind: CopyTarget) => {
    const text = kind === "code" ? (minted?.code ?? "") : kind === "link" ? inviteUrl : inviteMessage;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setAnyCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  };

  const copyButton = (kind: CopyTarget, variant: "accent" | "outline" = "outline") => (
    <Button type="button" variant={variant} size="sm" className="shrink-0" onClick={() => void copy(kind)}>
      <Icon icon={copied === kind ? "lucide:check" : "lucide:copy"} size={14} />
      {copied === kind ? "Copied" : COPY_LABEL[kind]}
    </Button>
  );

  const visibleInvites =
    invites && historyFilter === "active"
      ? invites.filter((invite) => invite.status === "active")
      : invites;

  const handleRevoke = async (invite: InviteCodeSummary) => {
    setListNotice(null);
    setRevokingId(invite.id);
    try {
      await revokeInviteCode(invite.id);
      const revokedAt = new Date().toISOString();
      setInvites((current) =>
        (current ?? []).map((row) =>
          row.id === invite.id ? { ...row, revokedAt, status: "revoked" } : row,
        ),
      );
      setListNotice({
        tone: "success",
        message: `Invite revoked${invite.note ? ` for ${invite.note}` : ""}. The code no longer creates an account.`,
      });
      void reload(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to revoke the invite code.";
      setListNotice({ tone: "danger", message: isFrozenMessage(message) || frozen ? FROZEN_WRITE : message });
    } finally {
      setRevokingId(null);
    }
  };

  const missingLanguages = roleMeetsFloor(role, "translator") && glossaryLocales.length === 0;
  const terms = describeInviteTerms(role, glossaryLocales, expiresInDays, maxUses);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
      <div className="space-y-4 lg:sticky lg:top-24">
        {minted ? (
          <EditorPanel className="overflow-visible" role="region" aria-label="New invite code">
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 ref={revealRef} tabIndex={-1} className="theme-accent-heading text-base font-semibold outline-none">
                    {`${getRoleDisplayName(minted.invite.role)} invite ready`}
                  </h3>
                  <p className="theme-warning-text-strong flex items-start gap-1.5 text-sm font-medium">
                    <Icon icon="lucide:eye-off" size={14} className="mt-0.5 shrink-0" />
                    Copy this now. It will not be shown again.
                  </p>
                </div>
                {confirmingDismiss ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-mr-2 shrink-0"
                    onClick={() => (anyCopied ? setMinted(null) : setConfirmingDismiss(true))}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
              {confirmingDismiss ? (
                <div role="group" aria-label="Close without copying" className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="theme-text-secondary">Close without copying? The code cannot be shown again.</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMinted(null)}>
                    Close it
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDismiss(false)}>
                    Keep it
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <pre
                  aria-label="Message to send"
                  className="theme-text-primary max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-subtle bg-subtle p-3 font-sans text-sm"
                >
                  {inviteMessage}
                </pre>
                {copyButton("message", "accent")}
              </div>
              <dl className="space-y-3 text-sm">
                <div className="space-y-1">
                  <dt className="type-meta-label theme-text-faint">Code</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <code
                      data-testid="minted-invite-code"
                      className="min-w-0 break-all rounded-control border border-subtle bg-subtle px-2 py-1 font-mono text-sm text-primary"
                    >
                      {minted.code}
                    </code>
                    {copyButton("code")}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="type-meta-label theme-text-faint">Link</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="theme-text-secondary min-w-0 break-all text-xs" data-testid="minted-invite-link">
                      {inviteUrl}
                    </span>
                    {copyButton("link")}
                  </dd>
                </div>
              </dl>
              {copyFailed ? (
                <Notice placement="inline" tone="danger" dismiss={() => setCopyFailed(false)}>
                  Copy failed. Select the text and copy it by hand.
                </Notice>
              ) : null}
              <p className="theme-text-faint text-xs">
                {getRoleDisplayName(minted.invite.role)}{" "}
                invite, expires {formatDate(minted.invite.expiresAt)},{" "}
                {minted.invite.maxUses}{" "}
                {minted.invite.maxUses === 1 ? "use" : "uses"}.
                {roleMeetsFloor(minted.invite.role, "translator") && ` Translation languages: ${languageNames(minted.invite.glossaryLocales) || "none"}.`}
              </p>
            </div>
          </EditorPanel>
        ) : null}

        <EditorPanel className="overflow-visible">
          <form onSubmit={handleMint} aria-labelledby={formHeadingId}>
            <div className="space-y-1 px-4 pt-4 sm:px-5">
              <h3 id={formHeadingId} className="theme-text-primary text-base font-semibold">
                <span className="sr-only">Mint an invite code: </span>
                New invite code
              </h3>
              <p className="theme-text-muted text-sm">The only way an account is created. Each code grants the roles you tick.</p>
            </div>
            <div className="space-y-5 px-4 py-4 sm:px-5">
              <div className="space-y-2">
                <MemberPermissionFields
                  label="Invite permissions"
                  role={role}
                  glossaryLocales={glossaryLocales}
                  disabled={isMinting}
                  onChange={(nextRole, nextLocales) => {
                    setRole(nextRole);
                    setGlossaryLocales(nextLocales);
                  }}
                />
                <p className="theme-text-muted text-xs">
                  <span className="theme-text-secondary font-medium">{getRoleDisplayName(role)}: </span>
                  {ROLE_DESCRIPTIONS[role].summary}
                </p>
              </div>
              <EditorField label="Note" htmlFor="invite-note" description="Who it is for. Only admins see it.">
                <Input
                  ref={noteRef}
                  id="invite-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={200}
                  placeholder="Ada, for the pharmacology pass"
                  className="text-[16px] md:text-sm"
                />
              </EditorField>
              <div className="grid grid-cols-2 gap-3">
                <EditorField label="Expires in (days)" htmlFor="invite-expiry">
                  <Input
                    id="invite-expiry"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    step={1}
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(event.target.value)}
                    required
                    className="text-[16px] tabular-nums md:text-sm"
                  />
                </EditorField>
                <EditorField label="Uses" htmlFor="invite-uses">
                  <Input
                    id="invite-uses"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                    required
                    className="text-[16px] tabular-nums md:text-sm"
                  />
                </EditorField>
              </div>
              <p className="theme-text-muted text-xs" aria-live="polite">
                {terms ?? "Expiry takes 1 to 365 days and uses 1 to 100."}
              </p>
            </div>
            <div className="theme-portal-rule space-y-2.5 border-t px-4 py-3 sm:px-5">
              {mintNotice ? (
                <Notice placement="inline" tone={mintNotice.tone} dismiss={() => setMintNotice(null)}>
                  {mintNotice.message}
                </Notice>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  type="submit"
                  variant="accent"
                  size="sm"
                  disabled={isMinting || missingLanguages}
                  aria-busy={isMinting || undefined}
                >
                  <Icon icon="lucide:ticket-plus" size={14} />
                  {isMinting ? "Creating" : "Create invite code"}
                </Button>
                <p className="theme-text-faint min-w-0 flex-1 text-xs">
                  {missingLanguages ? "Choose at least one language for a translator first." : "The code is shown once, right here."}
                </p>
              </div>
            </div>
          </form>
        </EditorPanel>
      </div>

      <section aria-labelledby={headingId} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 id={headingId} className="type-meta-label theme-text-muted">
            Issued codes
          </h3>
          <div className="flex items-center gap-1">
            <EditorSegmentedControl
              label="Show codes"
              value={historyFilter}
              onChange={(value) => setHistoryFilter(value as HistoryFilter)}
              options={[
                { value: "all", label: "All", ...(invites ? { badge: String(invites.length) } : {}) },
                { value: "active", label: "Active", ...(activeCount !== null ? { badge: String(activeCount) } : {}) },
              ]}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", TOUCH_ICON)}
              onClick={() => void reload()}
              disabled={isLoadingHistory && invites === null}
              aria-busy={isLoadingHistory || undefined}
              aria-label="Refresh invite codes"
              title="Refresh"
            >
              <Icon icon="lucide:refresh-cw" size={14} className={cn(isLoadingHistory && "motion-safe:animate-spin")} />
            </Button>
          </div>
        </div>
        {listNotice ? (
          <Notice placement="inline" tone={listNotice.tone} dismiss={() => setListNotice(null)}>
            {listNotice.message}
          </Notice>
        ) : null}

        {loadError ? (
          <LoadErrorState what="invite codes" message={loadError} onRetry={() => void reload()} />
        ) : invites === null ? (
          <RowSkeletons rows={4} label="invite codes" />
        ) : invites.length === 0 ? (
          <p className="theme-text-muted flex items-start gap-2 text-sm">
            <Icon icon="lucide:ticket" size={16} className="theme-text-faint mt-0.5 shrink-0" />
            No invite codes yet. Create one to bring someone in.
          </p>
        ) : visibleInvites?.length === 0 ? (
          <p className="theme-text-muted text-sm">
            No active codes{continuationCursor ? " in the codes loaded so far" : ""}.{" "}
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setHistoryFilter("all")}>
              Show every code
            </Button>
          </p>
        ) : (
          <ul className={LINK_LIST_CLASS} aria-label="Invite codes">
            {(visibleInvites ?? []).map((invite) => (
              <li key={invite.id} className="flex flex-col gap-2 px-2.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <EditorStatusPill tone={STATUS_TONE[invite.status]}>{STATUS_LABEL[invite.status]}</EditorStatusPill>
                    <span className="theme-text-primary text-sm font-medium">{getRoleDisplayName(invite.role)}</span>
                    {invite.note ? (
                      <span className="theme-text-secondary min-w-0 break-words text-sm">{invite.note}</span>
                    ) : null}
                  </div>
                  {roleMeetsFloor(invite.role, "translator") ? (
                    <p className="theme-text-muted text-xs">Translation languages: {languageNames(invite.glossaryLocales) || "none"}</p>
                  ) : null}
                  <p className="theme-text-faint flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="tabular-nums">{`${invite.redemptions.length} of ${invite.maxUses} used`}</span>
                    <span aria-hidden>·</span>
                    <span>
                      <RelativeDay iso={invite.createdAt} prefix="Created" /> by {nameFor(invite.createdBy)}
                    </span>
                    <span aria-hidden>·</span>
                    {invite.status === "revoked" && invite.revokedAt ? (
                      <RelativeDay iso={invite.revokedAt} prefix="Revoked" />
                    ) : (
                      <RelativeDay iso={invite.expiresAt} prefix={invite.status === "active" ? "Closes" : "Closed"} />
                    )}
                  </p>
                  {invite.redemptions.length > 0 ? (
                    <p className="theme-text-muted text-xs">
                      Redeemed by{" "}
                      {invite.redemptions.map((entry, index) => (
                        <span key={`${entry.email}:${entry.at}`}>
                          {index > 0 ? ", " : null}
                          {onOpenMember ? (
                            <Button
                              type="button"
                              variant="link"
                              size="auto"
                              className="text-xs"
                              title={`Open ${nameFor(entry.email)} in Members`}
                              onClick={() => onOpenMember(entry.email)}
                            >
                              {nameFor(entry.email)}
                            </Button>
                          ) : (
                            nameFor(entry.email)
                          )}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                {invite.status === "active" ? (
                  <Button
                    type="button"
                    variant="ghostDestructive"
                    size="sm"
                    className="-ml-2 self-start sm:ml-0"
                    disabled={revokingId === invite.id}
                    aria-busy={revokingId === invite.id || undefined}
                    onClick={() =>
                      confirm({
                        title: `Revoke this ${getRoleDisplayName(invite.role)} invite?`,
                        description: `${invite.note ? `The code noted "${invite.note}". ` : ""}Anyone holding this code can no longer create an account with it (${invite.redemptions.length} of ${invite.maxUses} uses spent). This cannot be undone; create a new code if they still need one.`,
                        confirmLabel: "Revoke invite",
                        destructive: true,
                        onConfirm: () => handleRevoke(invite),
                      })
                    }
                    aria-label={`Revoke invite${invite.note ? ` for ${invite.note}` : ""}`}
                  >
                    <Icon icon="lucide:ban" size={14} />
                    {revokingId === invite.id ? "Revoking" : "Revoke"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isLoadingHistory && invites !== null && invites.length > 0 ? (
          <p className="theme-text-faint text-sm" role="status">
            Loading older codes
          </p>
        ) : continuationCursor && !historyError && invites !== null ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const generation = loadGeneration.current;
                void loadContinuation(continuationCursor, generation);
              }}
            >
              Load older codes
            </Button>
            <span className="theme-text-faint text-xs tabular-nums">{`${countNoun(invites.length, "code")} loaded`}</span>
          </div>
        ) : null}
        {historyError ? (
          <LoadErrorState
            what="older invite codes"
            message={historyError}
            onRetry={() => {
              if (continuationCursor) {
                const generation = ++loadGeneration.current;
                void loadContinuation(continuationCursor, generation);
              } else {
                void reload(true);
              }
            }}
          />
        ) : null}
      </section>
      {dialog}
    </div>
  );
}
