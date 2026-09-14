"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NestedContentCard } from "@/components/ui/surface";
import {
  ActionNotice,
  EditorField,
  EditorFieldRow,
  EditorSelect,
  EditorStatusPill,
  LoadErrorState,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import {
  fetchInviteCodes,
  mintInviteCode,
  revokeInviteCode,
  type InviteCodeRole,
  type InviteCodeStatus,
  type InviteCodeSummary,
  type MintedInvite,
} from "./inviteCodeRequests";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { getRoleDisplayName, MANAGED_ROLES } from "@/lib/auth/roles";

const ROLE_OPTIONS = MANAGED_ROLES.map((value) => ({ value, label: getRoleDisplayName(value) }));

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

type Notice = { tone: "success" | "danger"; message: string };

/**
 * The body of the Members tab's "Invite codes" section: mint one, see its
 * plaintext exactly once, and manage the list. The section heading and
 * description belong to the tab; this panel renders no heading of its own.
 * Self-contained: it loads its own data from `/api/dev/invites` so the tab
 * can mount it without props.
 */
export default function InviteCodesPanel() {
  const [invites, setInvites] = useState<InviteCodeSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<InviteCodeRole>("editor");
  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [maxUses, setMaxUses] = useState("1");
  const [isMinting, setIsMinting] = useState(false);
  const [mintNotice, setMintNotice] = useState<Notice | null>(null);
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<Notice | null>(null);

  const reload = useCallback(async () => {
    try {
      setInvites(await fetchInviteCodes());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load invite codes.",
      );
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMintNotice(null);
    setIsMinting(true);
    try {
      const result = await mintInviteCode({
        role,
        note: note.trim() || undefined,
        expiresInDays: Number(expiresInDays),
        maxUses: Number(maxUses),
      });
      setMinted(result);
      setCopied(null);
      setNote("");
      setInvites((current) => [result.invite, ...(current ?? [])]);
    } catch (error) {
      setMintNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Unable to mint an invite code.",
      });
    } finally {
      setIsMinting(false);
    }
  };

  const inviteUrl = minted
    ? `${typeof window === "undefined" ? "" : window.location.origin}/invite?code=${encodeURIComponent(minted.code)}`
    : "";

  const copy = async (kind: "code" | "link") => {
    const text = kind === "code" ? (minted?.code ?? "") : inviteUrl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

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
      setListNotice({ tone: "success", message: "Invite revoked." });
    } catch (error) {
      setListNotice({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Unable to revoke the invite code.",
      });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleMint}
        className="space-y-4"
        aria-label="Mint an invite code"
      >
        <EditorFieldRow layout="twoColumn">
          <EditorField
            label="Role"
            htmlFor="invite-role"
            description={ROLE_DESCRIPTIONS[role].summary}
          >
            <EditorSelect
              id="invite-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as InviteCodeRole)
              }
              options={ROLE_OPTIONS}
            />
          </EditorField>
          <EditorField
            label="Note"
            htmlFor="invite-note"
            description="Who it is for; admins only."
          >
            <Input
              id="invite-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="Ada, for the pharmacology pass"
            />
          </EditorField>
        </EditorFieldRow>
        <EditorFieldRow layout="twoColumn">
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
            />
          </EditorField>
        </EditorFieldRow>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="accent"
            size="pill"
            className="rounded-full"
            disabled={isMinting}
          >
            {isMinting ? "Minting…" : "Mint invite"}
          </Button>
          {mintNotice ? (
            <ActionNotice
              tone={mintNotice.tone}
              onDismiss={() => setMintNotice(null)}
            >
              {mintNotice.message}
            </ActionNotice>
          ) : null}
        </div>
      </form>

      {minted ? (
        <NestedContentCard
          padding="sm"
          role="region"
          aria-label="New invite code"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold theme-accent-heading">
                Copy this now. It will not be shown again.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="quiet"
                onClick={() => setMinted(null)}
              >
                Dismiss
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code
                data-testid="minted-invite-code"
                className="rounded-md border border-subtle bg-subtle px-2 py-1 font-mono text-sm text-primary"
              >
                {minted.code}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="quiet"
                onClick={() => void copy("code")}
              >
                <Icon
                  icon={copied === "code" ? "lucide:check" : "lucide:copy"}
                  size={15}
                />
                {copied === "code" ? "Copied" : "Copy code"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="theme-text-secondary break-all text-xs"
                data-testid="minted-invite-link"
              >
                {inviteUrl}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="quiet"
                onClick={() => void copy("link")}
              >
                <Icon
                  icon={copied === "link" ? "lucide:check" : "lucide:copy"}
                  size={15}
                />
                {copied === "link" ? "Copied" : "Copy link"}
              </Button>
            </div>
            <p className="theme-text-faint text-xs">
              {
                ROLE_OPTIONS.find(
                  (option) => option.value === minted.invite.role,
                )?.label
              }{" "}
              invite, expires {formatDate(minted.invite.expiresAt)},{" "}
              {minted.invite.maxUses}{" "}
              {minted.invite.maxUses === 1 ? "use" : "uses"}.
            </p>
          </div>
        </NestedContentCard>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide theme-accent-heading">
            Issued codes
          </h4>
          <div className="flex items-center gap-2">
            {listNotice ? (
              <ActionNotice
                tone={listNotice.tone}
                onDismiss={() => setListNotice(null)}
              >
                {listNotice.message}
              </ActionNotice>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="quiet"
              onClick={() => void reload()}
            >
              <Icon icon="lucide:refresh-cw" size={15} />
              Refresh
            </Button>
          </div>
        </div>

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void reload()} />
        ) : invites === null ? (
          <p className="theme-text-faint text-sm">Loading invite codes…</p>
        ) : invites.length === 0 ? (
          <p className="theme-text-faint text-sm">No invite codes yet.</p>
        ) : (
          <ul className="space-y-2" aria-label="Invite codes">
            {invites.map((invite) => (
              <li key={invite.id}>
                <NestedContentCard padding="xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <EditorStatusPill tone={STATUS_TONE[invite.status]}>
                          {STATUS_LABEL[invite.status]}
                        </EditorStatusPill>
                        <span className="text-sm font-medium text-primary">
                          {
                            ROLE_OPTIONS.find(
                              (option) => option.value === invite.role,
                            )?.label
                          }
                        </span>
                        {invite.note ? (
                          <span className="theme-text-secondary text-sm">
                            {invite.note}
                          </span>
                        ) : null}
                      </div>
                      <p className="theme-text-faint text-xs">
                        {invite.redemptions.length}/{invite.maxUses} used.
                        Minted {formatDate(invite.createdAt)} by{" "}
                        {invite.createdBy}
                        {invite.status === "revoked" && invite.revokedAt
                          ? `, revoked ${formatDate(invite.revokedAt)}`
                          : `, expires ${formatDate(invite.expiresAt)}`}
                        .
                      </p>
                      {invite.redemptions.length > 0 ? (
                        <p className="theme-text-faint text-xs">
                          Redeemed by{" "}
                          {invite.redemptions
                            .map((entry) => entry.email)
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>
                    {invite.status === "active" ? (
                      <Button
                        type="button"
                        variant="ghostDestructive"
                        size="quiet"
                        disabled={revokingId === invite.id}
                        onClick={() => void handleRevoke(invite)}
                        aria-label={`Revoke invite${invite.note ? ` for ${invite.note}` : ""}`}
                      >
                        {revokingId === invite.id ? "Revoking…" : "Revoke"}
                      </Button>
                    ) : null}
                  </div>
                </NestedContentCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
