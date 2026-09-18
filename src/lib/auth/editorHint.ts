/**
 * A browser-local breadcrumb that says "an editor has used this browser" — and nothing else.
 *
 * It exists because the appearance cog most readers meet has never had a session to ask.
 * `src/app/layout.tsx:145` renders `<RouteFooter />` as a *sibling* of `{children}`, and only
 * `src/app/dev/layout.tsx:4` and `src/app/review/layout.tsx:9` wrap their children in
 * `AppProviders`. So the footer's `useContext(SessionContext)` resolved to `undefined` on every
 * route — `/dev` included — and the Lab entry it gates never appeared there at all. The only
 * instance that ever worked was `/dev/kit`'s (`src/app/dev/kit/KitCatalog.tsx:170`), which sits
 * inside the dev layout's provider. The entry shipped broken rather than merely narrow.
 *
 * Why not read the session token, which was the first plan: every cookie next-auth v4 issues is
 * `httpOnly: true` — `node_modules/next-auth/core/lib/cookie.js:20-27` for
 * `[__Secure-]next-auth.session-token`, and `:29-75` for callback-url, csrf-token, pkce, state and
 * nonce. `auth.ts:59-140` overrides none of them. So script can never see a session cookie, and the
 * only way to make it visible would be to hand the signed JWT to anything that gets injected.
 * Measured, not assumed.
 *
 * Why not have middleware decode the token and set a server-side hint, the obvious alternative:
 * `middleware.ts:180-184` deliberately returns *before* `getToken()` for every non-`/dev` request.
 * Moving the decode above that early return would add JWT crypto to every public request and make
 * the response vary by cookie — the CDN penalty this whole approach exists to avoid. Nothing on the
 * server reads this flag, so the response never varies by it and the highest-traffic surface pays
 * nothing at all.
 *
 * Why `localStorage` and not a cookie: nothing server-side reads it, so a cookie would buy no
 * capability while spending bytes on every request to the origin — static assets included — and
 * opening a question about cache behaviour on a static-first site for the sake of one popover
 * control. It also keeps one client-storage convention rather than two: `dosewiki-theme`,
 * `dosewiki-visual-style` and `dosewiki-accent` are all `localStorage` keys
 * (`src/theme/index.test.ts:71-72`, `src/theme/accents.test.ts:48`), and this is named to sit
 * beside them in medium as well as spelling.
 *
 * **This is a hint, not a security boundary, and it cannot become one.** The real gate is
 * `middleware.ts:186-214`, which redirects an anonymous request to `/sign-in` and a `viewer` to
 * `/unauthorized`, plus the in-page half at `src/app/dev/themes/page.tsx:31-41`; on Effect Index the
 * route does not exist at all (`src/app/dev/themes/page.tsx:24-26` calls `notFound()`). A reader who
 * types this key into their own console gets one extra control in a popover and a 302 for their
 * trouble. That is why it carries no identity, no email and no role name: there is nothing here
 * worth forging, and nothing worth leaking on a shared machine.
 *
 * A stale hint is therefore harmless by construction — an editor who signs out from a public page
 * keeps it, because the clear path only runs where the session context exists. `localStorage` does
 * not expire on its own, so the stored value *is* the write time and a read past
 * {@link EDITOR_HINT_MAX_AGE_MS} reports nothing.
 *
 * The cost, stated plainly: an editor must load one provider-backed page — any `/dev` or `/review`
 * route — once per browser before the public control appears. For this repo's editors, who arrive
 * via `/sign-in`'s `callbackUrl` into `/dev`, that is satisfied on the first page of the session.
 */

/**
 * Named for its neighbours in the same store: `dosewiki-theme`, `dosewiki-visual-style`,
 * `dosewiki-accent`.
 */
export const EDITOR_HINT_STORAGE_KEY = "dosewiki-editor-hint";

/**
 * 30 days — next-auth's default `session.maxAge` (`node_modules/next-auth/core/init.js:45,67`), which
 * is what applies here because `auth.ts:61-63` sets `strategy` and nothing else. Matching it means
 * the hint cannot outlive the session it was a shadow of.
 */
export const EDITOR_HINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reads a stored value as "an editor was here recently", validating it rather than trusting it — the
 * same stance the theme bootstrap takes when it checks a stored axis against a known set
 * (`src/context/ThemeContext.tsx:98-103`) instead of applying whatever it finds. Anything unparseable,
 * negative, or dated in the future reports `false`: a hand-edited key must read as "no hint" and must
 * never throw, because this runs in the footer of every page and a throw there would take the whole
 * footer down over a UI hint.
 *
 * A clock moved backwards drops the hint until the next provider-backed visit rewrites it. That is
 * the right way round: a future timestamp that never expires would be a permanent grant, and losing
 * a cosmetic control costs nothing.
 *
 * Exported for its own sake — the validation is the only part of this module with edge cases, and a
 * pure function over a string can be asserted without a store.
 */
export function isFreshEditorHint(stored: string | null, now: number = Date.now()): boolean {
  if (stored === null) {
    return false;
  }

  const writtenAt = Number(stored);

  if (!Number.isFinite(writtenAt)) {
    return false;
  }

  const age = now - writtenAt;

  return age >= 0 && age <= EDITOR_HINT_MAX_AGE_MS;
}

/**
 * Browser read. `false` on the server, where `localStorage` does not exist — callers must still keep
 * this out of their first render (see the mount gate in
 * `src/app/_components/AppearanceControls.tsx`), because a server that answers `false` and a client
 * that answers `true` would disagree on markup.
 */
export function readEditorHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return isFreshEditorHint(window.localStorage.getItem(EDITOR_HINT_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Leaves the hint, stamped with now. Re-writing an existing hint just renews its window. */
export function writeEditorHint(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(EDITOR_HINT_STORAGE_KEY, String(Date.now()));
  } catch {
    // A store that refuses writes — Safari's private mode, a full quota — costs an editor the
    // public control and nothing else. The same silence as `persistPreference`.
  }
}

/** Retracts the hint. */
export function clearEditorHint(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(EDITOR_HINT_STORAGE_KEY);
  } catch {
    // As above.
  }
}
