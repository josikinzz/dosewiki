# Dependency Security Record

Last verified: 2026-07-11

This document records the dependency remediation completed for GitHub issue
[#50](https://github.com/josikinzz/dosewiki-admin/issues/50), the current Bun
audit baseline, and the temporary exceptions that remain. It supplements the
automation policy in [Security CI](security-ci.md).

## Current baseline

The repository uses Bun `1.3.5`, the tracked `bun.lock`, and frozen-lockfile
installs in CI. The audit was rerun from the checked-in dependency graph with:

```bash
bun audit --production --json
bun audit --json
```

| Graph | Before | After | Change |
| --- | ---: | ---: | ---: |
| Production | 4 advisories: 1 High, 3 Moderate | 1 Moderate | 75% fewer advisories; no High |
| Full, including build/test tooling | 27 advisories: 15 High, 10 Moderate, 2 Low | 6 advisories: 3 High, 3 Moderate | 78% fewer advisories; 80% fewer High |

The remaining six audit entries reduce to three reviewed dependency chains.
They are recorded below rather than hidden or suppressed.

## Remediated chains

| Chain | Resolution | Reachability outcome |
| --- | --- | --- |
| `convex -> ws` | Convex `1.39.1` to `1.42.1`, which declares `ws` `8.21.0` | Removes both `ws` advisories, including the remotely triggerable memory-exhaustion issue fixed in `8.21.0`. |
| Next/Vite PostCSS | Direct PostCSS to `8.5.17`; top-level override keeps Next's pinned `8.4.31` out of the resolved graph | Removes the PostCSS stringify advisory from production and build graphs. The production build verifies framework compatibility. |
| Vite/Vitest | Vite `8.0.13` to `8.1.4`, plugin React `6.0.2` to `6.0.3`, Vitest and coverage `4.1.6` to `4.1.10` | Removes the Vite Windows path and credential-disclosure advisories and removes the old nested Vite/Rollup chain. |
| `jsdom -> undici` | Override to `undici` `7.28.0` within jsdom's declared `^7.25.0` range | Removes seven HTTP, proxy, WebSocket, cookie, and cache advisories from the test graph. |
| webpack schema validation | Overrides `fast-uri` to `3.1.3` | Removes two URL parsing advisories while remaining within Ajv's declared `^3.0.1` range. |
| ESLint cache | Overrides `flatted` to `3.4.2`; ESLint updated from `10.4.0` to `10.7.0` | Removes recursion and prototype-pollution advisories from lint execution. |
| Glob tooling | Overrides `picomatch` to `4.0.5`; TypeScript ESLint updated from `8.59.4` to `8.63.0` | Removes the method-injection and ReDoS advisories from Vite, Vitest, and TypeScript ESLint chains. |

The lockfile review found only the requested package families and their declared
transitive packages changing. Vite 8.1 consolidated the old nested Vite 7 and
Rollup platform packages into the existing Rolldown family. No new dependency
lifecycle script was introduced; Bun also does not execute dependency lifecycle
scripts unless a package is explicitly trusted.

## Temporary exceptions

### DEP-EXC-001: `uuid@8.3.2` through NextAuth

- **Advisory:** [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), Moderate.
- **Dependency path:** `next-auth@4.24.14 -> uuid@8.3.2`.
- **Reachability evidence:** the advisory applies to UUID v3, v5, and v6 when a
  caller supplies an undersized output buffer. NextAuth 4.24.14 imports and calls
  only `uuid.v4()` to create an encrypted JWT `jti`; dose.wiki does not import
  `uuid` directly and request input cannot select a UUID method or supply its
  output buffer.
- **Why no forced upgrade:** the patched line begins at `uuid@11.1.1`, while
  NextAuth declares `^8.3.2`. A cross-major override would exceed the upstream
  compatibility contract for an authentication dependency.
- **Compensating controls:** UUID generation remains encapsulated in NextAuth's
  server-side JWT path; the affected methods and buffer overload are not exposed.
  Auth and editor regression tests run before release.
- **Owner:** `josikinzz`.
- **Review date:** 2026-08-11.
- **Expiry:** 2026-10-11.
- **Exit condition:** upgrade NextAuth/Auth.js to a release that declares
  `uuid >=11.1.1`, or separately prove and regression-test an upstream-supported
  compatibility override before the expiry.

### DEP-EXC-002: `minimatch@3.1.2` and `brace-expansion@1.1.12` through JSX accessibility linting

- **Advisories:** [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26),
  [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj),
  [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74),
  and [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v).
- **Dependency path:** `eslint-plugin-jsx-a11y@6.10.2 -> minimatch@3.1.2 -> brace-expansion@1.1.12`.
- **Reachability evidence:** the plugin uses minimatch in its accessible-label and
  child-component checks. In this repository the patterns come from the plugin's
  fixed defaults; JSX component names are candidate strings, not patterns. The
  vulnerable minimatch cases require attacker-controlled pathological patterns,
  and the brace-expansion issue requires a zero-step brace sequence. The repo
  does not configure those rule patterns.
- **Why no forced upgrade:** `6.10.2` is the current stable JSX accessibility
  plugin and still declares `minimatch ^3.1.2`. Bun supports only top-level
  overrides, so forcing minimatch 10 globally would violate this plugin's major
  version contract and displace ESLint's separate minimatch 10 line.
- **Compensating controls:** this chain is absent from `bun audit --production`;
  it runs only in an ephemeral, read-only CI lint job or a developer shell. The
  workflow has `contents: read`, receives no production or Convex write
  credentials, and already executes contributor-controlled source, so a
  deliberate CI denial of service does not create an additional privilege path.
- **Owner:** `josikinzz`.
- **Review date:** 2026-08-11.
- **Expiry:** 2026-10-11.
- **Exit condition:** adopt an upstream `eslint-plugin-jsx-a11y` release that
  resolves minimatch `>=3.1.4` and brace-expansion `>=1.1.13`, or replace the
  plugin only after equivalent accessibility lint coverage is proven.

### DEP-EXC-003: `ajv@6.12.6` through raw-loader schema validation

- **Advisory:** [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6), Moderate.
- **Dependency path:** `raw-loader@4.0.2 -> schema-utils@3.3.0 -> ajv@6.12.6`.
- **Reachability evidence:** the advisory requires Ajv's optional `$data` feature
  and an attacker-controlled schema. Raw-loader uses schema-utils to validate its
  fixed loader options. dose.wiki's Next configuration supplies only the static
  raw-loader rule for tracked Markdown files and does not enable `$data` or pass
  article content as a validation schema.
- **Why no forced upgrade:** raw-loader has no newer stable release and Bun keeps
  schema-utils' Ajv 6 line isolated from the patched Ajv line used by current
  tooling. A global Ajv override would also force Ajv 6 into consumers that
  declare Ajv 8.
- **Compensating controls:** this chain is absent from the deployed production
  graph and runs only while building tracked source in an ephemeral, read-only
  CI job. The schema and loader options are code-reviewed configuration.
- **Owner:** `josikinzz`.
- **Review date:** 2026-08-11.
- **Expiry:** 2026-10-11.
- **Exit condition:** migrate Markdown imports to a maintained Next-native loader
  path or an upstream loader/schema-utils release that resolves Ajv `>=6.14.0`.

## Review procedure

On each review date:

1. rerun both Bun audit commands from a frozen install;
2. run `bun why` for each remaining package;
3. confirm the exact call site and trust boundary still match this record;
4. check upstream stable releases before extending an exception;
5. never extend beyond the expiry without a new dated rationale and owner.

## Primary sources

- [Bun overrides and their top-level-only limitation](https://bun.com/docs/pm/overrides)
- [Bun frozen lockfile and lifecycle-script behavior](https://bun.com/docs/pm/cli/install)
- [Vite 8.1 release notes](https://vite.dev/blog/announcing-vite8-1)
- [Vite supported release policy](https://vite.dev/releases)
- [ws memory-exhaustion advisory and patched `8.21.0`](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)
- [Vite launch-editor advisory and patched releases](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)
- [Vite filesystem-deny advisory](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
- [uuid buffer advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- npm registry metadata inspected for Convex `1.42.1`, Vite `8.1.4`, Vitest
  `4.1.10`, Next `16.2.10`, NextAuth `4.24.14`, ws `8.21.0`, and every pinned
  transitive version above.
