# Issue tracker: GitHub

Issues, implementation tickets, and specifications for this repository live in GitHub Issues at `josikinzz/dosewiki-admin`. Use the `gh` CLI for tracker operations from this clone.

## Conventions

- For issue publication, follow [the tracker publication branch](#when-a-skill-says-publish-to-the-issue-tracker).
- Before acting on a ticket, follow [the ticket-read branch](#when-a-skill-says-fetch-the-relevant-ticket).
- Apply the labels mapped in `docs/agents/triage-labels.md`.
- Do not close or rewrite a parent specification when publishing child tickets.
- Publish dependency edges using GitHub's native issue dependencies when available; otherwise add a `Blocked by: #<number>` section to the issue body.
- Work the frontier: an issue is ready only when all of its blocking issues are closed.

## Pull requests as a triage surface

The engineering-skill triage workflow accepts issues, not external or collaborator pull requests, as its request surface. This preserves in-progress collaborator work.

## When a skill says “publish to the issue tracker”

Create one GitHub issue in `josikinzz/dosewiki-admin` per specification or independently assignable implementation ticket.

## When a skill says “fetch the relevant ticket”

Read the full GitHub issue body, labels, and comments before continuing.
