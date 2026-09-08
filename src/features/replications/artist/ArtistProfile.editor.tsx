"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
import { EditorNotice, useConfirm, useDirtyGuard } from "@/features/dev/components";
import { ContributorProfileEditor } from "@/features/dev/tools/contributors/ContributorProfileEditor";
import { useContributorsController } from "@/features/dev/tools/contributors/useContributorsController";
import { buildOwnContributorPatch, toContributorForm, type OwnContributorPatch } from "@/features/dev/tools/contributors/contributorsModel";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ArtistIdentityHeader } from "./ArtistIdentityHeader";

type ArtistEditorProps = { profileKey: string | null; attributed: boolean; counts: { count: number; imageCount: number; videoCount: number }; verifiedReplicator: boolean };
const PROFILE_FIELD_LABELS: Record<keyof OwnContributorPatch, string> = {
  displayName: "Display name",
  bio: "Bio",
  avatarUrl: "Avatar URL",
  links: "Links",
};

function profileValue(value: OwnContributorPatch[keyof OwnContributorPatch]) {
  if (value === null) return "Not set";
  if (typeof value === "string") return value || "Empty";
  return value.map(({ label, url }) => `${label}: ${url}`).join("\n") || "No links";
}

export default function ArtistProfileEditor({ profileKey, attributed, counts, verifiedReplicator }: ArtistEditorProps) {
  const { enabled, mode } = useContextualEditing();
  const [open, setOpen] = useState(false);
  if (!enabled || mode !== "edit" || !attributed) return null;
  if (!profileKey) return <p className="theme-text-muted text-sm">This artist has not claimed a contributor profile. <Link href="/dev/contributors?scope=me" className="underline">Request profile access in the contributor workbench</Link>.</p>;
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>Edit artist profile</Button>
    {open ? <ProfileSession profileKey={profileKey} counts={counts} verifiedReplicator={verifiedReplicator} onClose={() => setOpen(false)} /> : null}
  </>;
}

function ProfileSession({ profileKey, counts, verifiedReplicator, onClose }: { profileKey: string; counts: ArtistEditorProps["counts"]; verifiedReplicator: boolean; onClose: () => void }) {
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const router = useRouter();
  const controller = useContributorsController({ profiles: [], canEdit: false, canApprove: false, sessionProfileKey: profileKey, contextualKey: profileKey });
  const [review, setReview] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const editorFields = useRef<HTMLFieldSetElement>(null);
  const wasReview = useRef(false);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
    else if (wasReview.current) editorFields.current?.querySelector("input")?.focus();
    wasReview.current = review;
  }, [review]);
  const [endorsementReview, setEndorsementReview] = useState(false);
  const [endorsementBusy, setEndorsementBusy] = useState(false);
  const [endorsementError, setEndorsementError] = useState<string | null>(null);
  const [endorsementOperation, setEndorsementOperation] = useState<string | null>(null);
  const { guard, dialog: discardDialog } = useDirtyGuard(controller.hasUnsavedChanges || !!endorsementOperation, {
    title: "Discard local profile changes?",
    description: "An already-sent publication is not undone. Discarding leaves the published profile as it is now.",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();
  const key = `profile:${profileKey}`;
  useEffect(() => { setDirty(key, controller.hasUnsavedChanges || !!endorsementOperation); return () => setDirty(key, false); }, [controller.hasUnsavedChanges, endorsementOperation, key, setDirty]);
  useEffect(() => registerDraftGuard(key, {
    canDiscard: controller.profileSaveState !== "saving" && !controller.publicationUncertain && !endorsementBusy && !endorsementOperation,
    discard: () => {
      if (controller.profileSaveState === "saving" || controller.publicationUncertain || endorsementBusy || endorsementOperation) return;
      controller.discardProfile();
      setEndorsementReview(false);
    },
  }), [controller.discardProfile, controller.profileSaveState, controller.publicationUncertain, endorsementBusy, endorsementOperation, key, registerDraftGuard]);
  useEffect(() => { if (controller.profileSaveState === "saved") { router.refresh(); setReview(false); } }, [controller.profileSaveState, router]);
  function close() {
    if (controller.profileSaveState === "saving" || controller.publicationUncertain || endorsementBusy || endorsementOperation) return;
    guard(() => {
      controller.discardProfile();
      onClose();
    });
  }
  const profile = controller.detail?.profile;
  const form = controller.form;
  const publishedPatch = review && profile ? buildOwnContributorPatch(toContributorForm(profile)) : null;
  const draftPatch = review && form ? buildOwnContributorPatch(form) : null;
  async function publishEndorsement() {
    if (!profile || endorsementBusy) return;
    if (!endorsementOperation && (controller.hasUnsavedChanges || controller.publicationUncertain || controller.profileSaveState === "saving")) return;
    const body = endorsementOperation ?? JSON.stringify({ key: profileKey, expectedUpdatedAt: profile.updatedAt, operationId: crypto.randomUUID(), approved_replicator: !profile.approved_replicator });
    setEndorsementOperation(body);
    setEndorsementBusy(true);
    setEndorsementError(null);
    try {
      const response = await fetch("/api/dev/contributor-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const payload = await response.json();
      if (!response.ok) { if (response.status < 500) setEndorsementOperation(null); throw new Error(payload.error ?? "Endorsement was not published."); }
      setEndorsementOperation(null);
      setEndorsementReview(false);
      controller.retryDetail();
      router.refresh();
    } catch (error) { setEndorsementError(error instanceof Error ? error.message : "Response unavailable. Retry to reconcile the same endorsement operation."); }
    finally { setEndorsementBusy(false); }
  }
  return <ContextualEditorPanel title="Edit artist profile" description="Local edits are private to this browser session. Publishing updates the shared profile on dose.wiki and Effect Index." open onOpenChange={(next) => { if (!next) close(); }}>
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      {discardDialog}
      {confirmDialog}
      {controller.isDetailLoading ? <p role="status">Loading this profile…</p> : null}
      {controller.detailError ? <div role="alert"><p>{controller.detailError}</p><Button variant="outline" onClick={controller.retryDetail}>Retry access check</Button><Link href="/dev/contributors?scope=me" className="ml-3 underline">Request profile access</Link></div> : null}
      {controller.notice ? <EditorNotice notice={controller.notice} /> : null}
      <fieldset ref={editorFields} hidden={review} disabled={controller.publicationUncertain || controller.profileSaveState === "saving" || endorsementBusy || !!endorsementOperation}>
        <ContributorProfileEditor controller={controller} contextual onReview={() => setReview(true)} />
      </fieldset>
      {controller.publicationUncertain ? <div role="alert"><p>The publication response was lost. Editing is paused; reconcile the same operation before publishing another change.</p><Button disabled={endorsementBusy || !!endorsementOperation} onClick={() => void controller.saveProfile()}>Reconcile publication</Button></div> : null}
      {review && profile && form && publishedPatch && draftPatch ? <section aria-label="Profile publication preview" className="min-w-0 space-y-4">
        <h3 ref={reviewHeading} tabIndex={-1} className="font-display text-xl">Local preview</h3>
        <ArtistIdentityHeader name={form.displayName} attributed browseAllHref="/replications" avatarUrl={controller.avatarRemoved ? null : controller.avatarPreviewUrl ?? (form.avatarUrl || profile.storedAvatarUrl)} approvedReplicator={profile.approved_replicator} verifiedReplicator={verifiedReplicator} role={profile.role} bio={<ProfileBioMarkdown content={form.bio} />} links={form.links} counts={counts} />
        <h3 className="font-display text-lg">Changes to publish</h3>
        {(Object.keys(draftPatch) as (keyof OwnContributorPatch)[]).filter((field) => JSON.stringify(draftPatch[field]) !== JSON.stringify(publishedPatch[field])).map((field) => <section key={field} className="min-w-0 space-y-2">
          <h4 className="font-semibold">{PROFILE_FIELD_LABELS[field]}</h4>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0"><h5 className="theme-text-muted text-sm">Published</h5><p className="whitespace-pre-wrap text-sm">{profileValue(publishedPatch[field])}</p></div>
            <div className="min-w-0"><h5 className="theme-text-muted text-sm">Your draft</h5><p className="whitespace-pre-wrap text-sm">{profileValue(draftPatch[field])}</p></div>
          </div>
        </section>)}
        {controller.avatarFile ? <p>Avatar will be replaced by {controller.avatarFile.name}.</p> : null}
        {controller.avatarRemoved ? <p>The existing avatar will be removed.</p> : null}
        <p>This publishes the displayed changes to both publications. Endorsements and account settings are unchanged.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" disabled={!controller.isProfileDirty || controller.publicationUncertain || controller.profileSaveState === "saving" || endorsementBusy || !!endorsementOperation} onClick={() => void controller.saveProfile()}>Confirm publish profile</Button>
          <Button variant="ghost" onClick={() => setReview(false)}>Keep editing</Button>
        </div>
        {controller.profileSaveState === "error" ? <Button variant="outline" disabled={controller.publicationUncertain || endorsementBusy || !!endorsementOperation} onClick={() => confirm({ title: "Discard draft and reload?", description: "Your local profile draft will be discarded and replaced with the current published profile.", confirmLabel: "Discard and reload", destructive: true, onConfirm: () => { controller.discardProfile(); controller.retryDetail(); setReview(false); } })}>Discard draft and reload published profile</Button> : null}
      </section> : null}
      {role === "admin" && profile && !review ? <section className="space-y-3" aria-label="Admin endorsement">
        <h3 className="font-display text-lg">Admin endorsement</h3>
        <p>Approved replicator is an editorial endorsement, not identity verification. It stars the artist and raises their gallery rail on both publications.</p>
        {endorsementError ? <div role="alert"><p>{endorsementError}</p>{!endorsementOperation ? <Button variant="outline" onClick={() => { controller.retryDetail(); setEndorsementReview(false); setEndorsementError(null); }}>Reload current endorsement</Button> : null}</div> : null}
        {endorsementReview ? <><p>{profile.approved_replicator ? "Remove" : "Grant"} Approved replicator for {profile.displayName}?</p><Button disabled={endorsementBusy || (!endorsementOperation && (controller.hasUnsavedChanges || controller.publicationUncertain || controller.profileSaveState === "saving"))} onClick={() => void publishEndorsement()}>{endorsementOperation ? "Reconcile endorsement" : "Confirm endorsement change"}</Button><Button variant="ghost" disabled={endorsementBusy || !!endorsementOperation} onClick={() => setEndorsementReview(false)}>Cancel</Button></> : <Button variant="outline" disabled={controller.hasUnsavedChanges || controller.publicationUncertain || controller.profileSaveState === "saving"} onClick={() => setEndorsementReview(true)}>{profile.approved_replicator ? "Review endorsement removal" : "Review endorsement grant"}</Button>}
        <Link href="/dev/contributors" className="block underline">Other privileged profile settings remain in the workbench</Link>
      </section> : null}
    </div>
  </ContextualEditorPanel>;
}
