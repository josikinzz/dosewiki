# Trip Report Submission Intake Prototype

PROTOTYPE - delete or absorb after the backend decision is made.

## Question

Does a private Convex intake queue give dose.wiki the right backend shape for
user-submitted trip reports before any report is promoted to the existing
public Convex `tripReports` collection on Vercel?

## How To Run

```bash
npm run prototype:trip-report-submissions
```

## What To Check

- Public submissions insert as private `submitted` rows, not public reports.
- Honeypot submissions become `spam` rows without blocking the whole intake path.
- Invalid consent/age/title/substance payloads fail before insert.
- Only `accepted` rows can preview a Convex promotion payload.
- Publishing writes the public Convex trip report before marking the private
  submission `exported`.

## Current Verdict

Pending hands-on review.

## Disposal

Once the backend shape is settled, delete this prototype folder or lift only the
validated validation/state logic into production modules.
