"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorField, EditorSection, Notice, useConfirm, type NoticeMessage } from "@/features/dev/components";
import { assignReportOwner, normalizeReportSlug } from "./myReportsModel";
import { assignedNotice } from "./ownershipCopy";

export function AssignOwnerSection({ onAssigned }: { onAssigned: () => void }) {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const { confirm, dialog } = useConfirm();
  const hintId = useId();
  const resolvedSlug = normalizeReportSlug(slug);
  const pastedAddress = slug.trim() !== "" && resolvedSlug !== slug.trim();

  const assign = async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await assignReportOwner(resolvedSlug, email);
      setNotice({ tone: "success", message: assignedNotice(result.slug, result.ownerEmail) });
      setSlug("");
      setEmail("");
      onAssigned();
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "The owner was not assigned.",
      });
    } finally {
      setPending(false);
    }
  };

  const ask = () => {
    confirm({
      title: "Give edit rights to this member?",
      description: `${email.trim()} will be able to change the title, tags and body of /reports/${resolvedSlug} from My reports, and each save goes live. Any earlier owner loses that right.`,
      confirmLabel: "Assign owner",
      onConfirm: assign,
    });
  };

  return (
    <EditorSection
      icon="lucide:user-round-check"
      title="Assign an owner"
      description="Admins only. The member you name can then edit the report from their own My reports."
    >
      <form
        className="grid max-w-4xl grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && resolvedSlug && email.trim()) ask();
        }}
      >
        <EditorField
          htmlFor="assign-owner-slug"
          label="Report slug"
          description={
            pastedAddress ? (
              <>
                Assigns <span className="font-mono">/reports/{resolvedSlug}</span>
              </>
            ) : (
              "The part after /reports/. Pasting the page address works too."
            )
          }
        >
          {(props) => (
            <Input
              {...props}
              value={slug}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => setSlug(event.target.value)}
            />
          )}
        </EditorField>
        <EditorField htmlFor="assign-owner-email" label="Member email" description="Must belong to an existing member account.">
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </EditorField>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            variant="accent"
            size="sm"
            aria-describedby={hintId}
            aria-busy={pending || undefined}
            disabled={pending || !resolvedSlug || !email.trim()}
          >
            {pending ? "Assigning" : "Assign owner"}
          </Button>
          <span id={hintId} className="theme-text-faint text-xs">
            You confirm before anything changes.
          </span>
        </div>
        {notice ? (
          <div className="sm:col-span-2">
            <Notice {...notice} dismiss={() => setNotice(null)} />
          </div>
        ) : null}
      </form>
      {dialog}
    </EditorSection>
  );
}
