# html-docs

Unlisted standalone HTML documents (visual explainers, one-off reports), served raw at
`/html-docs/<name>` on the admin host — no app shell, no header, `noindex`, 404 on
Effect Index, unreachable on the dose.wiki construction hosts.

To publish one: drop a **fully self-contained** `.html` file here (lowercase
`[a-z0-9._-]` name) and deploy. The public-document CSP blocks external font and script
CDNs, so embed fonts as `data:` URIs and avoid CDN libraries
(`embed-fonts.py` from the visual-explainer skill handles fonts).
