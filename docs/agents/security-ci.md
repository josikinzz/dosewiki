# Security CI

Last verified: 2026-07-11

This document owns the repository's automated secret and dependency reporting policy. The checks are intentionally split between controls that are already blocking and dependency findings that are still being introduced as non-blocking reports.

## Current controls

### Secret scanning

`scripts/security/scan-secrets.mjs` is the shared scanner used by CI and the pre-commit hook.

- CI runs `node scripts/security/scan-secrets.mjs --tracked` and scans every path returned by `git ls-files`, without an extension allowlist.
- `.husky/check-secrets.sh` runs the scanner with `--staged`, reading the exact Git index blobs rather than potentially different working-tree content.
- A finding prints only a stable rule ID and escaped filename. Matched values and matching lines are never printed.
- Synthetic CLI tests build temporary Git repositories and construct non-working credential-shaped fixtures at runtime. No real credential or complete fixture value is stored in the repository.

Secret scanning is blocking now. A detected credential must be removed before a commit or CI run can pass. If a real credential is ever committed, removing it is not sufficient: rotate or revoke it and follow the incident process.

The scanner is a deterministic pattern check, not a complete secret-management system. It does not scan Git history, untracked files, repository settings, or external logs. Periodic history scanning and provider-side secret protection remain separate operational controls.

### Reproducible CI execution

For exact action pins, runtime versions, jobs and artifact retention, inspect `.github/workflows/vercel-policy-checks.yml` and `package.json`. The policy-check workflow uses `contents: read`; this is not a repository-wide permission invariant. `.github/workflows/molecule-pack-nightly.yml` intentionally uses `contents: write` for its separately approved generated-pack publication, governed by [nightly molecule reads](data-credentials.md#nightly-molecule-reads).

Action or Bun updates should be a deliberate pull request that:

1. verifies the upstream release and commit SHA;
2. updates the adjacent version comment and the Bun package-manager declaration when applicable;
3. runs the focused security policy tests and the normal verification graph;
4. reviews behavior changes before merging.

### Dependency audit reporting

The policy-check workflow reports production and full dependency graphs separately.
Its job definition owns the exact audit commands, artifact names and retention.
During the observation phase, dependency findings remain visible but non-blocking;
this does not weaken secret scanning or authorize automatic dependency changes.

Dependency upgrades and advisory remediation are tracked separately from this reporting control. Do not use `bun audit fix` automatically in CI.
Dated remediation evidence and time-limited exceptions are recorded in
[Dependency Security](dependency-security.md); current status requires fresh evidence.

## Promotion to required checks

Promote a dependency audit from informational to required only when all of these conditions are met:

1. **Stable execution:** the audit has produced valid JSON artifacts in at least five consecutive default-branch runs without registry or tooling failures.
2. **Triage complete:** every current advisory is classified as production-reachable, development-only, or not reachable in this repository.
3. **High-impact production risk resolved:** no unexpired Critical or High production-reachable advisory remains.
4. **Exceptions are accountable:** every accepted advisory has a linked issue, rationale, owner, review date, and expiry date; an exception may not suppress an entire severity class.
5. **Ownership exists:** a named maintainer reviews new failures and the dependency remediation ticket remains active.
6. **Preview proof:** the proposed blocking behavior passes on a pull request without changing application dependencies as part of the policy-only change.

Promote production auditing first. Once the criteria hold, remove `continue-on-error` from the production audit step or add a following gate that fails on its recorded outcome. Keep the full graph informational until development/build advisories meet the same triage and exception criteria; then promote it independently.

If registry downtime or a Bun regression causes false failures after promotion, temporarily return only the affected audit to informational mode in a reviewed change. Do not disable secret scanning, discard audit artifacts, or broadly ignore advisories.

## Verification

When changing this surface, use the focused scanner and CI-policy checks and the
applicable verification commands declared in `package.json`. Inspect the workflow
itself for its current execution graph rather than copying that graph here.
