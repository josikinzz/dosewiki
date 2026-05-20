# API/Auth GitHub File Write Module

## Files

- `src/app/api/save-substance-index/route.ts`
- `lib/server/github/client.js`
- `lib/server/github/saveSubstanceIndex.js`
- `lib/server/github/saveUserProfile.js`
- `lib/server/github/validation.js`
- `lib/server/github/validation.test.ts`
- `src/app/api/save-user-profile/route.ts`
- `lib/convex/serverWriteHealth.ts`
- `src/app/api/save-to-convex/route.ts`

## Problem

GitHub-backed file persistence still exists for selected operational workflows, but the current Interface to `saveSubstanceIndexWithGitHub` is broad: a loosely typed `body`, `submittedBy`, and `githubToken`. The Implementation validates payload fragments, serializes several unrelated files, builds changelog entries, creates blobs/trees/commits, and updates the branch. Repository owner, name, branch, author, and file paths are constants inside the client and save modules.

The GitHub client is a thin adapter over fetch, while the file-write workflows are large Modules with interfaces that expose too little intent and too much implicit configuration. Understanding a save requires tracking HTTP route auth, route-level submitted-by derivation, GitHub token presence, file normalization, changelog behavior, and branch update semantics.

## Proposed deepening opportunity

Introduce a GitHub file change Module whose Interface is a typed change set: target repository, actor, commit message, expected branch, and named file updates. Build `saveSubstanceIndexWithGitHub` and any remaining profile GitHub save flow as adapters that translate domain input into that change set. Keep low-level GitHub fetch behavior behind a repository adapter, but move commit assembly and branch-update policy into a deeper Module with a smaller Interface.

The change set should make repository configuration explicit and injectable for tests. It should also distinguish file-backed backup/export writes from Convex-authoritative live writes so callers do not treat GitHub and Convex persistence as interchangeable.

## Benefits

- **Module**: gives GitHub persistence a file-change Module instead of route-shaped save functions with broad bodies.
- **Interface**: callers submit a typed change set and actor, not raw request bodies plus hidden repository constants.
- **Implementation**: blob creation, tree creation, commit creation, branch update, and GitHub error mapping live behind the Module.
- **Depth**: a compact change-set Interface hides the multi-step GitHub write Implementation.
- **Seam**: the repository adapter is the seam for GitHub API calls, while the change-set Module is the seam for commit policy.
- **Adapter**: substance index and profile workflows become adapters from domain edits to file changes.
- **Leverage**: future file-backed exports can reuse commit assembly without copying GitHub sequencing.
- **Locality**: repository configuration, branch policy, and GitHub failure handling become local to one area.

## Test plan

- Add unit tests for change-set validation, path serialization, commit message generation, and branch update error mapping.
- Add adapter tests proving substance-index payloads produce the same file paths and changelog entries as today.
- Add fake repository adapter tests for GitHub 404 file loads, protected branch failures, missing SHAs, and non-JSON payloads.
- Keep `lib/server/github/validation.test.ts` focused on article payload validity rather than commit mechanics.

## Risk/rollout notes

This should be a documentation-first and test-first migration because GitHub writes are operationally sensitive. Preserve current repo, branch, author, and path defaults. Do not expand GitHub-backed live data writes; the rollout should clarify that Convex remains authoritative and GitHub writes are file-backed persistence adapters for remaining workflows.
