# Security CI

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
Time-limited exceptions and the reasons behind the top-level overrides are recorded under [Dependency overrides and exceptions](#dependency-overrides-and-exceptions); current status requires fresh evidence.

## Promotion to required checks

Promote a dependency audit from informational to required only when all of these conditions are met:

1. **Stable execution:** the audit has produced valid JSON artifacts in at least five consecutive default-branch runs without registry or tooling failures.
2. **Triage complete:** every current advisory is classified as production-reachable, development-only, or not reachable in this repository.
3. **High-impact production risk resolved:** no unexpired Critical or High production-reachable advisory remains.
4. **Exceptions are accountable:** every accepted advisory has a linked issue, rationale, owner, review date, and expiry date; an exception may not suppress an entire severity class.
5. **Ownership exists:** a named maintainer reviews new failures and dependency remediation stays tracked in the issue tracker.
6. **Preview proof:** the proposed blocking behavior passes on a pull request without changing application dependencies as part of the policy-only change.

Promote production auditing first. Once the criteria hold, remove `continue-on-error` from the production audit step or add a following gate that fails on its recorded outcome. Keep the full graph informational until development/build advisories meet the same triage and exception criteria; then promote it independently.

If registry downtime or a Bun regression causes false failures after promotion, temporarily return only the affected audit to informational mode in a reviewed change. Do not disable secret scanning, discard audit artifacts, or broadly ignore advisories.

## Dependency overrides and exceptions

`package.json` declares top-level `overrides`. Bun supports only top-level overrides, so each one must stay inside every consumer's declared range; an override that crosses a consumer's major version is not an acceptable fix.

| Override | Why it exists |
| --- | --- |
| `postcss` `8.5.17` | Keeps Next's older pinned PostCSS out of the resolved graph (stringify advisory); the production build verifies framework compatibility. |
| `undici` `7.28.0` | Within jsdom's declared `^7.25.0` range; removes HTTP, proxy, WebSocket, cookie, and cache advisories from the test graph. |
| `fast-uri` `3.1.3` | Within Ajv's declared `^3.0.1` range; removes URL parsing advisories from webpack schema validation. |
| `flatted` `3.4.2` | Removes recursion and prototype-pollution advisories from ESLint cache handling. |
| `picomatch` `4.0.5` | Removes method-injection and ReDoS advisories from Vite, Vitest, and TypeScript ESLint chains. |

Remove an override when the consumer declares the patched line itself.

Accepted advisories are dated reachability decisions, not fresh assertions about the checkout. Each keeps its rationale, review date, expiry, and exit condition until a new audit supplies current graph and call-site evidence. An exception may not suppress an entire severity class, and no exception is resolved merely because a declaration changed.

### DEP-EXC-001: `uuid@8.3.2` through NextAuth

- **Advisory:** [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), Moderate.
- **Path:** `next-auth@4.24.14 -> uuid@8.3.2`.
- **Reachability:** the advisory applies to UUID v3, v5, and v6 with a caller-supplied undersized buffer. NextAuth calls only `uuid.v4()` for the JWT `jti`; the app does not import `uuid` directly and request input cannot select a UUID method or buffer.
- **Why no forced upgrade:** the patched line begins at `uuid@11.1.1` while NextAuth declares `^8.3.2`; a cross-major override would exceed the upstream contract for an authentication dependency.
- **Review date / expiry:** 2026-08-11 / 2026-10-11.
- **Exit condition:** an Auth.js release that declares `uuid >=11.1.1`, or a proven, regression-tested upstream-supported override.

### DEP-EXC-002: `minimatch@3.1.2` and `brace-expansion@1.1.12` through JSX accessibility linting

- **Advisories:** [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74), [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v).
- **Path:** `eslint-plugin-jsx-a11y@6.10.2 -> minimatch@3.1.2 -> brace-expansion@1.1.12`.
- **Reachability:** the plugin's patterns are its fixed defaults; JSX component names are candidate strings, not patterns. The chain is absent from `bun audit --production` and runs only in an ephemeral, read-only lint job that already executes contributor-controlled source.
- **Why no forced upgrade:** the plugin still declares `minimatch ^3.1.2`; a global minimatch 10 override would break its contract and displace ESLint's separate minimatch 10 line.
- **Review date / expiry:** 2026-08-11 / 2026-10-11.
- **Exit condition:** an upstream plugin release resolving minimatch `>=3.1.4` and brace-expansion `>=1.1.13`, or a replacement with proven equivalent accessibility coverage.

### DEP-EXC-003: `ajv@6.12.6` through raw-loader schema validation

- **Advisory:** [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6), Moderate.
- **Path:** `raw-loader@4.0.2 -> schema-utils@3.3.0 -> ajv@6.12.6`.
- **Reachability:** requires Ajv's optional `$data` feature and an attacker-controlled schema. raw-loader validates only its fixed loader options; the Next configuration supplies a static raw-loader rule for tracked Markdown and never passes article content as a schema. The chain is absent from the deployed production graph.
- **Why no forced upgrade:** raw-loader has no newer stable release, and a global Ajv override would force Ajv 6 into consumers that declare Ajv 8.
- **Review date / expiry:** 2026-08-11 / 2026-10-11.
- **Exit condition:** migrate Markdown imports to a Next-native loader path, or an upstream loader/schema-utils release that resolves Ajv `>=6.14.0`.

### Review procedure

Before claiming current advisory counts, resolving an exception, or extending it:

1. rerun `bun audit --production --json` and `bun audit --json` from a frozen install (`bun install --frozen-lockfile`);
2. run `bun why <package>` for each remaining package;
3. confirm the exact call site and trust boundary still match this record;
4. check upstream stable releases before extending an exception;
5. never extend beyond the expiry without a new dated rationale and owner.

## Verification

When changing this surface, use the focused scanner and CI-policy checks and the
applicable verification commands declared in `package.json`. Inspect the workflow
itself for its current execution graph rather than copying that graph here.
