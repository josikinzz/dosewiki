"use client";

/**
 * The fields of one written page, shared by the Writing workspace pane and
 * the public page's contextual panel: the words (title, cover for a blog post,
 * teaser, body), then how it is published (state, address, date), then who it
 * is by and how it is filed (byline, tags). Every field is disabled while the
 * controller holds the form still (loading, saving, a recovery choice, an
 * unconfirmed publication).
 */

import { useId, useMemo, useState, type ReactNode } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { EditorField, EditorSegmentedControl } from "@/features/dev/components";
import { SearchableMultiPicker } from "@/features/dev/components/SearchablePicker";
import { TagMultiSelect } from "@/features/dev/components/tag-multi-select/TagMultiSelect";
import { cn } from "@/lib/utils";

import type { WritingWorkbenchController } from "./useWritingWorkbenchController";
import { writingAddress, writingTagOptions, type WritingDraft } from "./writingEditorModel";

/** A stored date the date input can show; anything else shows empty beside its field error. */
const DATE_INPUT_VALUE = /^\d{4}-\d{2}-\d{2}/;

/** The teaser length a listing card shows without cutting it short. */
const TEASER_GUIDE = 160;

export type WritingFieldsProps = {
  controller: WritingWorkbenchController;
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading: boolean;
  canApprove: boolean;
  /** The contextual panel: prose first, publication details folded, no group headings. */
  contextual?: boolean;
  /** Draw the Draft / Published choice among the publishing fields (the workspace pane does; the contextual panel keeps it by its save). */
  showStatus?: boolean;
};

export function WritingFields({
  controller,
  contributorProfiles,
  profilesLoading,
  canApprove,
  contextual = false,
  showStatus = false,
}: WritingFieldsProps) {
  const { kind, draft, readOnly, slugAvailability, dateError, coverError, updateTitle, updateSlug, updateDraft, setByline, setDateIncomplete } = controller;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const emphasiseCover = kind === "blog";
  // A proposal never renames, so an editor keeps a saved entry's slug.
  const slugLocked = !canApprove && controller.loadedRow !== null;
  const cover = draft.coverImageUrl.trim();
  const tagOptions = useMemo(() => writingTagOptions(controller.entries ?? []), [controller.entries]);
  const bylineOptions = useMemo(
    () => contributorProfiles.map((profile) => ({ value: profile.key, label: profile.displayName, hint: `@${profile.key.toLowerCase()}` })),
    [contributorProfiles],
  );
  const address = writingAddress(controller.loadedRow?.kind ?? kind, draft.slug.trim());
  const bodyError = controller.parsedBody.error;
  const gap = contextual ? "space-y-4" : "space-y-6";

  const words = (
    <>
      <EditorField label="Title">
        {(control) => (
          <Input
            {...control}
            value={draft.title}
            disabled={readOnly}
            className={contextual ? undefined : "font-semibold"}
            onChange={(event) => updateTitle(event.target.value)}
          />
        )}
      </EditorField>

      {emphasiseCover ? (
        <EditorField
          label="Cover image"
          description="Shown on the blog index card and above the post. A full https:// address or a site path starting with /."
          error={coverError}
        >
          {(control) => (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <Input
                {...control}
                className="min-w-0 flex-1"
                value={draft.coverImageUrl}
                disabled={readOnly}
                inputMode="url"
                onChange={(event) => updateDraft({ coverImageUrl: event.target.value })}
              />
              {cover && !coverError ? (
                failedCover === cover ? (
                  <p className="theme-warning-text text-xs sm:w-40">This image could not be loaded. Check the address.</p>
                ) : (
                  // A raw <img>: the address is whatever was typed, with no
                  // known size for next/image, and the error event is how a
                  // dead link is reported.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, @next/next/no-img-element -- `error` is a load event, not an interaction; a typed address has no known size.
                  <img
                    src={cover}
                    alt="Cover preview"
                    className="aspect-[16/10] w-full shrink-0 rounded-card border border-[color:var(--editor-panel-border)] object-cover sm:h-20 sm:w-32"
                    onError={() => setFailedCover(cover)}
                  />
                )
              ) : null}
            </div>
          )}
        </EditorField>
      ) : null}

      <EditorField
        label="Teaser"
        description={emphasiseCover ? "The standfirst under the title, and the blurb on the index card." : "One or two sentences, shown under the title and in listings."}
        counter={
          <span className={cn("tabular-nums", draft.teaser.length > TEASER_GUIDE && "theme-warning-text")}>
            {`${draft.teaser.length} of about ${TEASER_GUIDE} characters`}
          </span>
        }
      >
        {(control) => (
          <Textarea
            {...control}
            className="leading-6"
            rows={2}
            value={draft.teaser}
            disabled={readOnly}
            onChange={(event) => updateDraft({ teaser: event.target.value })}
          />
        )}
      </EditorField>
    </>
  );

  const body = (
    <EditorField
      label="Body"
      description={`${draft.bodyFormat === "vcode" ? "VCode, kept in its original format" : "Markdown"}. Level 2 headings (##) become the ${kind === "blog" ? "post's sections" : "article's contents list"}.`}
      counter={<span className="tabular-nums">{`${draft.body.length.toLocaleString()} characters`}</span>}
      error={bodyError ? `The body markup does not parse: ${bodyError}` : undefined}
      errorLive
    >
      {(control) => (
        <Textarea
          {...control}
          className="min-h-[18rem] resize-y font-mono leading-6"
          rows={contextual ? 10 : 20}
          value={draft.body}
          disabled={readOnly}
          onChange={(event) => updateDraft({ body: event.target.value })}
        />
      )}
    </EditorField>
  );

  const publishing = (
    <>
      {showStatus ? (
        <div className="space-y-2">
          {/* An editor proposes the state too; an admin's approval applies it. */}
          <EditorSegmentedControl
            label="Publication state"
            value={draft.status}
            onChange={(value) => updateDraft({ status: value as WritingDraft["status"] })}
            options={[
              { value: "draft", label: "Draft", icon: "lucide:file-pen-line", disabled: readOnly },
              { value: "published", label: "Published", icon: "lucide:globe", disabled: readOnly },
            ]}
          />
          <p className="theme-text-faint text-xs">
            {draft.status === "published"
              ? `Published shows at ${address} once ${canApprove ? "you save" : "an admin approves it"}.`
              : "A draft stays off the public site."}
          </p>
        </div>
      ) : null}

      <EditorField
        label="Address"
        description={
          <>
            {`The page lives at ${address}. Lowercase letters, digits and single hyphens.`}
            {slugLocked ? " Only an admin can change the address of a saved page." : ""}
          </>
        }
        counter={slugStatusLabel(slugAvailability.state)}
        error={slugAvailability.state === "invalid" || slugAvailability.state === "taken" ? slugAvailability.message : undefined}
        errorLive
      >
        {(control) => (
          <Input
            {...control}
            className="font-mono"
            value={draft.slug}
            disabled={readOnly || slugLocked}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => updateSlug(event.target.value)}
          />
        )}
      </EditorField>

      <EditorField label="Publication date" description="The date shown on the page. Leave it empty to show none." error={dateError} errorLive>
        {(control) => (
          <Input
            {...control}
            type="date"
            className="w-auto"
            value={DATE_INPUT_VALUE.test(draft.publicationDate) ? draft.publicationDate.slice(0, 10) : ""}
            disabled={readOnly}
            onChange={(event) => {
              setDateIncomplete(event.target.validity.badInput);
              updateDraft({ publicationDate: event.target.value });
            }}
          />
        )}
      </EditorField>
    </>
  );

  const credits = (
    <>
      <EditorField
        label="Byline"
        description={contributorProfiles.length === 0 && !profilesLoading ? "Contributor profile keys credited on the page, separated by commas." : "Contributor profiles credited on the page, in order. Search by name or profile key."}
      >
        {(control) =>
          contributorProfiles.length === 0 && !profilesLoading ? (
            <Input {...control} value={draft.authorProfileKeys.join(", ")} disabled={readOnly} onChange={(event) => setByline(event.target.value.split(",").map((key) => key.trim()).filter(Boolean))} placeholder="Contributor profile keys, comma separated" />
          ) : profilesLoading ? (
            <p role="status" className="theme-text-faint text-sm">Loading contributors</p>
          ) : (
            <SearchableMultiPicker
              id={control.id}
              options={bylineOptions}
              value={draft.authorProfileKeys}
              onChange={setByline}
              disabled={readOnly}
              placeholder="Add a contributor"
              emptyText="No contributor matches that."
              ariaLabel="Byline"
            />
          )
        }
      </EditorField>

      <TagMultiSelect
        label="Tags"
        helperText="Pick an existing tag, or type a new one and press Enter."
        placeholder="Add a tag"
        value={draft.tags}
        options={tagOptions}
        onChange={(tags) => updateDraft({ tags })}
        disabled={readOnly}
      />
    </>
  );

  if (contextual) {
    return (
      <div className={gap}>
        {words}
        <ExpandButton variant="inline" isExpanded={detailsOpen} onToggle={() => setDetailsOpen((value) => !value)} ariaControls={detailsId} ariaLabel="Publication details and attribution" label="Publication details and attribution" />
        <div id={detailsId} className={gap} hidden={!detailsOpen}>
          {publishing}
          {credits}
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <FieldGroup title="Words">
        {words}
        {body}
      </FieldGroup>
      <FieldGroup title="Publishing">{publishing}</FieldGroup>
      <FieldGroup title="Byline and tags">{credits}</FieldGroup>
    </div>
  );
}

/** A labelled group of fields: a `fieldset` whose legend reads as a quiet meta label. */
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-5">
      <legend className="type-meta-label theme-text-muted mb-4">{title}</legend>
      {children}
    </fieldset>
  );
}

function slugStatusLabel(state: string): ReactNode {
  switch (state) {
    case "free":
      return <span className="theme-success-text-strong">Available</span>;
    case "current":
      return "Current address";
    case "taken":
      return "Taken";
    case "invalid":
      return "Invalid";
    default:
      return "";
  }
}
