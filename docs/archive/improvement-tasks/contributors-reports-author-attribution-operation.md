# Contributors Reports Author Attribution Operation

## Files

- `convex/contributorProfiles.ts`
- `convex/lib/contributorProfiles.ts`
- `convex/tripReports.ts`
- `lib/convex/publicData.contributors.ts`
- `lib/convex/publicData.reports.ts`
- `src/app/contributors/[profileKey]/page.tsx`
- `src/features/dev/profile/ProfileEditorTab.tsx`
- `src/app/api/save-user-profile/route.ts`

## Problem

Contributor profile identity and trip report authorship are maintained as separate write surfaces. `contributorProfiles.renameKey` changes a profile key and aliases, while `tripReports.renameAuthor` changes embedded `subject.name` values across reports. Public contributor pages then fetch reports with `getReportsByAuthor(profile.displayName)`, and report pages attach profile links by matching the embedded author name against display names, aliases, and first words.

That means an identity-affecting profile change can silently alter report discoverability without one Module owning the operation. A profile display name edit, key rename, alias migration, or report author rename each touches the same author attribution concept, but the current Interface is a set of low-level mutations and public read heuristics. The Implementation knowledge leaks into routes and tools: maintainers must know when to update aliases, when to rename report authors, and which public reads rely on display-name matching.

## Proposed deepening opportunity

Create an author attribution operation Module for contributor/report changes. Its Interface should express operations in domain terms: claim profile for author, rename public profile key, change public display name, merge alias into profile, and retarget trip reports to a contributor.

Behind that Seam, coordinate contributor profile patches, trip report author updates, alias preservation, membership ownership checks, and public revalidation targets. `contributorProfiles.ts` and `tripReports.ts` can remain storage Adapters, but identity-affecting writes should go through the deeper operation Module instead of requiring callers to combine mutations manually.

The public read matching Module can still resolve legacy author names, but writes should leave an explicit attribution trail: which contributor key owns which report author names, and whether embedded report text should preserve the original subject name.

## Benefits

- **Module**: turns contributor/report authorship into a coherent Module rather than separate profile and report mutation Implementations.
- **Interface**: callers ask for attribution operations without needing to know display-name matching, alias side effects, or report patch loops.
- **Implementation**: ownership checks, alias retention, report author updates, and route revalidation stay together.
- **Depth**: one small operation Interface hides cross-table write sequencing and public-read compatibility rules.
- **Seam**: storage mutations become Adapters behind the author attribution Seam.
- **Adapter**: Convex table patches, App Router save routes, and future migration scripts can all adapt to the same operation Interface.
- **Leverage**: profile edits, contributor redirects, report lists, and detail-page author links benefit from one attribution policy.
- **Locality**: bugs where report authors disappear from contributor pages or link to the wrong profile are fixed in one place.

## Test plan

- Add operation tests for changing a display name while preserving reports under the contributor page.
- Add tests for key rename with old key retained as an alias and report author links still resolving.
- Add tests for retargeting reports from an old author name to a contributor profile without allowing a viewer to edit another user's profile.
- Add public read contract tests for exact display-name match, alias match, old key alias, and unmatched legacy author.
- Add route tests that `save-user-profile` invokes the operation path for identity-affecting edits and revalidates both old and new contributor/report paths.

## Risk/rollout notes

Report subject names are public content. Preserve existing rendered author names unless the operation explicitly requests an embedded author rename. Roll out by adding the operation Module as a wrapper around current mutations, then route profile-key/display-name changes through it. Before changing behavior, snapshot current contributor pages with reports so attribution regressions are easy to detect.
