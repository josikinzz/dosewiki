# Domain docs

This is a single-context repository. Engineering skills should consume the repository's domain and architecture documentation as follows.

## Before exploring

- Read root `CONTEXT.md` for established domain vocabulary. It is currently citation-focused, so use `README.md` and architecture documentation for general application context.
- Read `ARCHITECTURE.md` before architecture, runtime, or data-ownership changes.
- Read relevant ADRs in `docs/adr/`, especially when changing citation or publication invariants.
- Use `docs/architecture/runtime-and-data.md` for authentication, write boundaries, Convex ownership, and runtime data flow.

## Vocabulary

Use glossary terms from `CONTEXT.md` exactly where they apply. For this security program, preserve established terms including Citable Article Surface, Citation-Only Edit, Citation Evidence Trail, Citation Draft, Production Rollout Batch, and Citation Rollout Stage Gate.

If the program introduces durable new concepts such as Published Revision or Independent Approval, add them through the domain-modeling workflow instead of allowing competing synonyms to spread.

## Architectural decisions

Surface any conflict with an existing ADR explicitly. In particular, server-side citation hardening must preserve ADR-0001's invariant that stripping citation markers restores the original article text exactly.
