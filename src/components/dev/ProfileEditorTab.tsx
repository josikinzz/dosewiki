import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ExternalLink, FileText, Link2, Plus, RefreshCw, Save, Trash2, UserRound } from "lucide-react";

import { SectionCard } from "../common/SectionCard";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { ChangeLogEntry } from "../../data/changeLog";

const MAX_BIO_LENGTH = 4000;
const MAX_LINKS = 3;

export type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

type ProfileFormLink = {
  label: string;
  url: string;
};

type ProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  links: ProfileFormLink[];
};

type ProfileEditorTabProps = {
  baseInputClass: string;
  profile: NormalizedUserProfile;
  profileHistory: ChangeLogEntry[];
  verifyCredentials: (
    options?: { username?: string; password?: string }
  ) => Promise<{ username: string; password: string; key: string }>;
  onProfileUpdated: (profile: NormalizedUserProfile, canonicalKey: string) => void;
  hasStoredCredentials: boolean;
};

const toFormState = (profile: NormalizedUserProfile): ProfileFormState => ({
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
  bio: profile.bio,
  links: profile.links.map((link) => ({ ...link })),
});

const normalizeFormState = (form: ProfileFormState) => ({
  displayName: form.displayName.trim(),
  avatarUrl: form.avatarUrl.trim(),
  bio: form.bio.replace(/\r\n/g, "\n"),
  links: form.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label.length > 0 && link.url.length > 0)
    .slice(0, MAX_LINKS),
});

const bioMarkdownComponents = {
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => <strong className="text-white" {...props} />,
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function ProfileEditorTab({
  baseInputClass,
  profile,
  profileHistory,
  verifyCredentials,
  onProfileUpdated,
  hasStoredCredentials,
}: ProfileEditorTabProps) {
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(profile));
  }, [profile]);

  const normalizedForm = useMemo(() => normalizeFormState(form), [form]);
  const baseline = useMemo(() => normalizeFormState(toFormState(profile)), [profile]);
  const isDirty = useMemo(() => JSON.stringify(normalizedForm) !== JSON.stringify(baseline), [baseline, normalizedForm]);

  const bioLength = normalizedForm.bio.length;
  const hasPartialLink = useMemo(
    () =>
      form.links.some((link) => {
        const label = link.label.trim();
        const url = link.url.trim();
        return (label.length > 0 && url.length === 0) || (url.length > 0 && label.length === 0);
      }),
    [form.links],
  );

  const previewLinks = normalizedForm.links;

  const handleLinkChange = (index: number, field: keyof ProfileFormLink, value: string) => {
    setForm((previous) => {
      const nextLinks = [...previous.links];
      nextLinks[index] = { ...nextLinks[index], [field]: value };
      return { ...previous, links: nextLinks };
    });
  };

  const handleRemoveLink = (index: number) => {
    setForm((previous) => {
      const nextLinks = previous.links.filter((_, linkIndex) => linkIndex !== index);
      return { ...previous, links: nextLinks };
    });
  };

  const handleAddLink = () => {
    setForm((previous) => {
      if (previous.links.length >= MAX_LINKS) {
        return previous;
      }
      return {
        ...previous,
        links: [...previous.links, { label: "", url: "" }],
      };
    });
  };

  const handleReset = () => {
    setForm(toFormState(profile));
    setNotice({ type: "success", message: "Profile form reset." });
  };

  const handleSave = async () => {
    setNotice(null);

    if (!hasStoredCredentials) {
      setNotice({ type: "error", message: "Save your credentials above before editing your profile." });
      return;
    }

    if (!isDirty) {
      setNotice({ type: "success", message: "No changes to save." });
      return;
    }

    if (bioLength > MAX_BIO_LENGTH) {
      setNotice({ type: "error", message: `Bio exceeds ${MAX_BIO_LENGTH} character limit.` });
      return;
    }

    if (hasPartialLink) {
      setNotice({ type: "error", message: "Complete link label and URL fields or remove the incomplete entry." });
      return;
    }

    try {
      setIsSaving(true);
      setNotice({ type: "success", message: "Verifying credentials…" });
      const credentials = await verifyCredentials();
      setNotice({ type: "success", message: "Saving profile…" });

      const payload: Record<string, unknown> = {
        displayName: normalizedForm.displayName,
        bio: normalizedForm.bio,
        links: normalizedForm.links,
      };

      if (normalizedForm.avatarUrl.length > 0) {
        payload.avatarUrl = normalizedForm.avatarUrl;
      }

      const response = await fetch("/api/save-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          profile: payload,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof result.error === "string" ? result.error : "Unable to save profile.";
        setNotice({ type: "error", message });
        return;
      }

      if (result.unchanged) {
        setNotice({ type: "success", message: "Profile already up to date." });
        return;
      }

      const nextProfile: NormalizedUserProfile | undefined = result.profile;
      if (nextProfile) {
        onProfileUpdated(nextProfile, credentials.key);
        setForm(toFormState(nextProfile));
      }

      setNotice({ type: "success", message: "Profile saved successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify credentials.";
      setNotice({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
      <SectionCard className="space-y-6 bg-white/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Profile</p>
            <h2 className="text-lg font-semibold text-fuchsia-200">Edit contributor bio</h2>
            <p className="mt-2 text-sm text-white/65">
              Update your public profile copy, avatar, and external links. Markdown is supported in the bio field.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <a
              href={`#/contributors/${profile.key}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/75 transition hover:border-fuchsia-400 hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View public profile
            </a>
            <UserRound className="hidden h-10 w-10 text-fuchsia-300 sm:block" />
          </div>
        </div>

        {notice && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {notice.message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="profile-display-name">
                Display name
              </label>
              <input
                id="profile-display-name"
                type="text"
                className={baseInputClass}
                value={form.displayName}
                onChange={(event) => setForm((previous) => ({ ...previous, displayName: event.target.value }))}
                placeholder="Contributor name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="profile-avatar-url">
                Avatar URL
              </label>
              <input
                id="profile-avatar-url"
                type="url"
                className={baseInputClass}
                value={form.avatarUrl}
                onChange={(event) => setForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                placeholder="https://example.com/avatar.png"
              />
              <p className="text-xs text-white/45">Must be an https:// image URL. Leave blank to use initials.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="profile-bio">
                  Bio
                </label>
                <span className={`text-xs ${bioLength > MAX_BIO_LENGTH ? "text-rose-300" : "text-white/45"}`}>
                  {bioLength}/{MAX_BIO_LENGTH}
                </span>
              </div>
              <textarea
                id="profile-bio"
                className={`${baseInputClass} min-h-[180px] resize-y`}
                value={form.bio}
                onChange={(event) => setForm((previous) => ({ ...previous, bio: event.target.value }))}
                placeholder="Share your research focus, experience, or collaboration interests."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">Links</p>
                <span className="text-xs text-white/45">
                  {form.links.length}/{MAX_LINKS}
                </span>
              </div>

              {form.links.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/55">
                  No links added yet. Use the button below to add up to three trusted resources or social profiles.
                </p>
              )}

              <div className="space-y-3">
                {form.links.map((link, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                    <input
                      type="text"
                      className={baseInputClass}
                      value={link.label}
                      onChange={(event) => handleLinkChange(index, "label", event.target.value)}
                      placeholder="Label (e.g., Portfolio)"
                    />
                    <input
                      type="url"
                      className={baseInputClass}
                      value={link.url}
                      onChange={(event) => handleLinkChange(index, "url", event.target.value)}
                      placeholder="https://example.com"
                    />
                    <button
                      type="button"
                      className="inline-flex h-[42px] items-center justify-center rounded-xl border border-white/12 px-3 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
                      onClick={() => handleRemoveLink(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove link</span>
                    </button>
                  </div>
                ))}
              </div>

              {hasPartialLink && (
                <p className="text-xs text-rose-300">
                  Complete both the label and URL before saving your link.
                </p>
              )}

              <button
                type="button"
                onClick={handleAddLink}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35"
                disabled={form.links.length >= MAX_LINKS}
              >
                <Plus className="h-4 w-4" />
                Add link
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/30">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <FileText className="h-4 w-4 text-fuchsia-300" />
                Markdown preview
              </div>
              {normalizedForm.bio.trim().length === 0 ? (
                <p className="mt-3 text-sm text-white/55">
                  The preview will update as you write. Use Markdown for headings, emphasis, and lists.
                </p>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={bioMarkdownComponents}
                  className="mt-3 space-y-3"
                >
                  {normalizedForm.bio}
                </ReactMarkdown>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/30">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <Link2 className="h-4 w-4 text-fuchsia-300" />
                Link preview
              </div>
              {previewLinks.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">No external links yet. Add up to three trusted resources.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {previewLinks.map((link) => (
                    <li
                      key={link.url}
                      className="flex items-center justify-between rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white/80"
                    >
                      <span>{link.label}</span>
                      <ExternalLink className="h-4 w-4 text-white/55" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty || !hasStoredCredentials}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 transition ${
              isSaving || !isDirty || !hasStoredCredentials
                ? "cursor-not-allowed border-white/10 bg-white/10 text-white/40"
                : "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white"
            }`}
          >
            <Save className="h-4 w-4" />
            Save profile
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving || !isDirty}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-white/80 transition ${
              isSaving || !isDirty
                ? "cursor-not-allowed border-white/10 bg-white/10 text-white/35"
                : "border-white/12 hover:border-white/25 hover:text-white"
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Reset changes
          </button>
        </div>
      </SectionCard>

      <div className="space-y-6">
        <SectionCard className="space-y-4 bg-white/[0.04]">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Activity</p>
            <h2 className="text-lg font-semibold text-fuchsia-200">Recent contributions</h2>
          </div>
          {profileHistory.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm text-white/60">
              No commits recorded yet. Ship updates via the editor to populate this timeline.
            </p>
          ) : (
            <ul className="space-y-4">
              {profileHistory.map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
                  <p className="text-sm font-semibold text-white/90">{formatDate(entry.createdAt)}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {entry.commit?.url ? (
                      <a
                        href={entry.commit.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-fuchsia-200 transition hover:text-fuchsia-100"
                      >
                        {entry.commit.message}
                      </a>
                    ) : (
                      entry.commit.message
                    )}
                  </p>
                  {entry.articles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.articles.map((article) => (
                        <span
                          key={`${entry.id}-${article.slug}`}
                          className="inline-flex items-center rounded-full border border-white/12 px-3 py-1 text-[0.75rem] text-white/75"
                        >
                          {article.title}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
