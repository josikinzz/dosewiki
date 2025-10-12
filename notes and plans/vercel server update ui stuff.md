# Vercel GitHub Save Integration Plan

## Overview
Introduce a password-protected “Commit to GitHub” workflow inside the Developer Draft Editor (`#/dev`). Editors can review `articles.json`, authenticate with the shared admin password, and push updates directly to the `main` branch through Vercel serverless functions.

## Preconditions
- ✅ Vercel environment variables `ADMIN_PASSWORD` and `GITHUB_TOKEN` exist (token has `repo` scope).
- ✅ Production repo: `josikinzz/dosewiki`.
- 🔁 Local secret management: create `.env.local` (ignored by git) with matching variables for manual testing.

## Serverless API Routes
1. `api/auth.js`
   - POST only; responds with `{ authorized: true }` when `req.body.password === process.env.ADMIN_PASSWORD`.
   - Return `405` for non-POST and `401` for invalid passwords.
   - Ensure the handler gracefully handles empty bodies (Vercel parses JSON when the request uses `Content-Type: application/json`).

2. `api/save-articles.js`
   - POST handler that performs the following sequence:
     1. Re-validate `req.body.password` against `ADMIN_PASSWORD`.
     2. Confirm `articlesData` exists; bail with `400` otherwise.
     3. Fetch the current `src/data/articles.json` to obtain its `sha`.
     4. Base64 encode the new JSON payload (use `JSON.stringify(articlesData, null, 2)`).
     5. PUT the update back to GitHub with a contextual commit message (default: `Update articles.json via dev editor - <ISO timestamp>`).
   - Surface non-200 responses from GitHub as `500` with the upstream message for easier debugging.
   - Add a `User-Agent` header (e.g., `dose.wiki-dev-editor`) to both requests.

3. `vercel.json`
   - Configure function limits (example below) if cold-start tuning is required:
     ```json
     {
       "functions": {
         "api/**/*.js": {
           "memory": 1024,
           "maxDuration": 10
         }
       }
     }
     ```

## DevMode Editor Integration
1. **Data wiring**
   - Reuse the `articles` array from `useDevMode()` (`src/components/dev/DevModeContext.tsx`). This is the editable in-memory dataset that reflects the current draft state.
   - When POSTing to `/api/save-articles`, send a plain object (not stringified) derived from `articles`; the API handler handles serialization.

2. **Auth & Save state**
   - Extend existing React state with:
     ```ts
     const [adminPassword, setAdminPassword] = useState("");
     const [isSaving, setIsSaving] = useState(false);
     const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
     ```
   - Reuse `ChangeNotice` (`{ type: "success" | "error"; message: string }`).
   - Drive status messaging through `githubNotice`, cleared on route changes or new submissions.

3. **Save handler**
   ```ts
   const handleSaveToGitHub = async () => {
     if (!adminPassword.trim()) {
       setGithubNotice({ type: "error", message: "Enter the admin password before committing." });
       return;
     }

     try {
       setIsSaving(true);
       setGithubNotice({ type: "success", message: "Verifying password…" });

       const authResponse = await fetch("/api/auth", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ password: adminPassword }),
       });

       if (!authResponse.ok) {
         const payload = await authResponse.json().catch(() => ({}));
         throw new Error(payload.error || "Authentication failed.");
       }

       setGithubNotice({ type: "success", message: "Password verified. Saving to GitHub…" });

       const saveResponse = await fetch("/api/save-articles", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           password: adminPassword,
           articlesData: articles,
           commitMessage: `Dev editor update - ${new Date().toLocaleString()}`,
         }),
       });

       const result = await saveResponse.json().catch(() => ({}));

       if (!saveResponse.ok) {
         throw new Error(result.details || result.error || "Save failed.");
       }

       setGithubNotice({
         type: "success",
         message: result.commitUrl ? `Saved to GitHub. Commit → ${result.commitUrl}` : "Saved to GitHub.",
       });
       setAdminPassword("");
     } catch (error) {
       const reason = error instanceof Error ? error.message : "Unexpected error.";
       setGithubNotice({ type: "error", message: reason });
     } finally {
       setIsSaving(false);
       window.setTimeout(() => setGithubNotice(null), 10000);
     }
   };
   ```

4. **UI composition**
   - Insert a new `SectionCard` beneath the Dataset actions card (`src/components/pages/DevModePage.tsx`) so the layout remains in the left column stack.
   - Follow the style guide (`notes and plans/dosewiki-visual-style-guide.md`):
     - Card background `bg-white/[0.04]`, border `border-white/10` (inherited from `SectionCard`).
     - Heading: `text-lg font-semibold text-fuchsia-200` with microcopy label `text-[11px] uppercase tracking-[0.35em] text-white/45`.
     - Replace emoji with a Lucide icon (e.g., `ShieldCheck` or `KeyRound`).
     - Inputs: `bg-slate-950/60 border-white/10 text-white/85 placeholder:text-white/45 focus:ring-fuchsia-300`.
     - Primary button: accent variant `border-fuchsia-500/35 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200`, disabled state uses `opacity-60`.

5. **Status messaging**
   - Display `githubNotice` using the existing notice treatment: `text-emerald-300` for success, `text-rose-300` for errors.
   - Position the message in the card footer (mirroring the JSON editor card) to avoid duplicating layout patterns.

6. **Accessibility & UX**
   - Allow pressing Enter while the password field is focused to trigger `handleSaveToGitHub` when not loading.
   - Disable the button while `isSaving` or when the password field is empty.
   - Mention that commits trigger a Vercel deployment in subdued helper text (`text-xs text-white/45`).

## Styling Checklist
- ✅ No light-mode blues; stick to cosmic dark overlays and fuchsia highlights.
- ✅ Use Lucide icons (import from `lucide-react`) sized to `h-4 w-4`.
- ✅ Maintain 2-space indentation and Tailwind utility order (layout → color → effects).
- ✅ Keep copy concise: “Commit to GitHub” title, “Admin password” label, helper line warning about production deploys.

## Environment & Tooling
- Add `.env.local` and `.env*.local` to `.gitignore` if missing (currently absent).
- Vite’s dev server does not proxy `/api/*`; run `vercel dev` for end-to-end testing.
- Build commands remain `npm run build` and `npm run build:inline` (run both before handing off changes).

## Manual QA Flow
1. `vercel dev` (ensures API routes resolve).
2. Navigate to `http://localhost:3000/#/dev`.
3. Make a visible edit (e.g., tweak an article field) and click “Save draft” to keep local state consistent.
4. Enter the admin password and press “Commit to GitHub”.
5. Confirm success notice renders and that the linked commit appears on GitHub.
6. Repeat with an incorrect password to validate error handling.
7. Run `npm run build` and `npm run build:inline` to ensure static output still succeeds.

## Files to Touch
- `api/auth.js` *(new)*
- `api/save-articles.js` *(new)*
- `vercel.json` *(new if not present)*
- `.gitignore` *(append environment patterns if needed)*
- `src/components/pages/DevModePage.tsx`

## Troubleshooting
- **401 Invalid password**: check the Vercel environment variable value and local `.env.local`.
- **GitHub 404/403**: confirm the token, repository path (`src/data/articles.json`), and branch (`main`).
- **Body parsing issues**: ensure requests send `Content-Type: application/json`; if problems persist, parse `req.body` manually.
- **Local API 404**: use `vercel dev` or deploy to Vercel preview; `npm run dev` alone cannot serve `/api/*` routes.

Keep this plan updated as the implementation evolves so the DevMode GitHub save feature remains aligned with the design system and deployment stack.
