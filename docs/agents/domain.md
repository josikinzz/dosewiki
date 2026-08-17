# Domain docs

This repository has one domain glossary at root.

## Read by branch

- Read `CONTEXT.md` before naming or changing citation workflow concepts, legality research, article-review state, or replication surfaces.
- Read `ARCHITECTURE.md` before changing runtime ownership, route boundaries, data flow, or deployment architecture.
- Read `docs/architecture/runtime-and-data.md` before changing authentication, write boundaries, Convex ownership, or runtime data flow.
- Read the relevant record in `docs/adr/` before changing an invariant it owns.

## Vocabulary

Use the canonical terms and `_Avoid_` boundaries in `CONTEXT.md`. When a durable project-specific concept lacks a term, add it through the domain-modeling workflow instead of spreading synonyms.

## Architectural decisions

Surface conflicts with an ADR before implementation. Citation changes must preserve [ADR-0001](../adr/0001-citation-only-marker-workflow.md): stripping citation markers restores the original article text exactly.
