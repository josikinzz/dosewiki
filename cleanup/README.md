# Cleanup Workspace

This folder is the dedicated planning surface for the active cleanup wave. It coordinates the code cleanup work required to bring oversized implementation files back into a maintainable state, using the existing repo cleanup standards and the `clean-up` skill as the bar.

## Contents

- [Central tracker](./CLEANUP-TASKS.md)
- [Per-file plans](./plans/)

## Working Rules

- Follow the folder order in [the central tracker](./CLEANUP-TASKS.md) unless a dependency forces a different sequence.
- Complete one plan at a time and update the central tracker immediately after each implementation slice.
- Treat styling, generated code, config-heavy modules, and deprecated scripts differently from active logic. The goal is maintainability, not pretending every code hotspot should be refactored the same way.
- The repo already has root-level [CLEANUP-AUDIT.md](../CLEANUP-AUDIT.md) and [CLEANUP-TASKS.md](../CLEANUP-TASKS.md). This folder is the dedicated code-only execution plan for oversized implementation files.

## Current Scope

- Total in-scope oversized code files: **18**
- Active logic hotspots: **15**
- Config-heavy modules: **1**
- Generated/config code files: **1**
- Deprecated code files: **1**

## Out Of Scope

These are archived from the active cleanup burn-down:

- markdown plans, reports, and guides
- prompt documents
- skill documents
- JSON data artifacts and export archives
- lockfiles

Generated on 2026-04-23 MDT.
