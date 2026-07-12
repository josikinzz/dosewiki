# Issue tracker: GitHub

Issues, implementation tickets, and specifications for this repository live in GitHub Issues at `josikinzz/dosewiki-admin`. Use the `gh` CLI for tracker operations from this clone.

## Conventions

- Create one GitHub issue per specification or independently assignable implementation ticket.
- Read an issue and its comments before acting on it.
- Apply the labels mapped in `docs/agents/triage-labels.md`.
- Do not close or rewrite a parent specification when publishing child tickets.
- Publish dependency edges using GitHub's native issue dependencies when available; otherwise add a `Blocked by: #<number>` section to the issue body.
- Work the frontier: an issue is ready only when all of its blocking issues are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

External and collaborator pull requests are not automatically treated as feature requests by the engineering-skill triage workflow. This prevents the workflow from interfering with in-progress collaborator work.

## When a skill says “publish to the issue tracker”

Create a GitHub issue in `josikinzz/dosewiki-admin`.

## When a skill says “fetch the relevant ticket”

Read the full GitHub issue body, labels, and comments before continuing.
