# html-docs

This directory is an editor-only local document source for self-contained HTML
explainers. Files may be read by the protected `/html-docs/<name>` route using a
lowercase `[a-z0-9._-]` filename. The route name is a compatibility contract and
does not make every file here public.

Do not treat `noindex`, an unlisted URL, host naming, or construction-host
routing as access control. A document must contain no secrets or private history,
must be intentionally approved for its audience, and must rely on the route's
editor authorization. Keep each HTML file self-contained: embed fonts as `data:`
URIs and avoid external script or font CDNs.

This describes the local code contract only. It does not claim that the
authorization behavior has been deployed or verified on any production host.
