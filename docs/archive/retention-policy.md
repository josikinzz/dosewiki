# Archive Retention Policy

Last reviewed: 2026-05-28

Archived plans, audits, generated records, and retired guides are historical context, not current contributor instructions. Current architecture and workflow authority lives in `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture/`, and `scripts/README.md`.

## Retention Labels

| Label | Meaning | Default action |
| --- | --- | --- |
| `current-authority` | Active instructions for contributors or automation. | Keep discoverable and test for drift. |
| `durable-record` | Historical decision, audit, migration, or completed task record. | Keep with a banner or index entry; do not treat as active guidance. |
| `retired-runtime` | Instructions for the old Vite/static/local-JSON app. | Keep only with a top-of-file tombstone or move under an archive. |
| `generated-record` | Export, report, queue, or run metadata retained for provenance. | Keep only when covered by artifact lineage or generated export retention metadata. |
| `delete-candidate` | Duplicate, superseded, or ownerless material with no durable value. | Delete after owner review, unless another active task owns cleanup. |

## Search Hygiene

- Archive indexes should summarize retained material instead of making every completed task look like active work.
- Retired-runtime files must say they are not current app guidance in the first screen of the file.
- Completed audit task directories should keep durable task records, but current work should point to task trackers or indexes, not scattered completed instructions.
- Do not delete broad generated-export or fixture trees until the generated artifact policy has classified them.

## Current Classifications

| Path | Label | Notes |
| --- | --- | --- |
| `docs/archive/improvement-tasks/` | `durable-record` | Historical improvement task records. Use as background only. |
| `docs/audits/thermo-nuclear-2026-05-28/` | `durable-record` while implementation is in progress | Current Phase 3 work may still reference open tasks; completed tasks should remain indexed by `TASK-TRACKER.md`. |
| `notes-and-plans/guides/dosewiki-site-readme.md` | `retired-runtime` | Old Vite/static guide retained with a tombstone. |
| `.claude/skills/vite/` | `retired-runtime` | Tombstone only. |
| `notes-and-plans/exports/` | `generated-record` | Governed by `scripts/lib/local-artifact-hygiene-policy.mjs` and `src/data/artifactLineageManifest.json`. |
