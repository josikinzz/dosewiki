## Dev Commit Auth Troubleshooting

**Current issue**  
Attempts to commit edits from the Developer Draft Editor still fail during the `/api/auth` verification step in production. Verified credentials (e.g., username `JOSIE`) trigger HTTP 500 responses and the UI shows `Authentication failed.` while the browser console logs the failing `POST https://www.dose.wiki/api/auth 500` alongside unrelated `Permissions-Policy` and Chrome extension 404 warnings. Local development continues to work with the same credentials.

**Context**  
- The Dev Tools credential card now captures a username (environment variable key) plus password, saves both to `localStorage`, and keeps trimmed copies in state.  
- The GitHub commit card reads the saved credentials, posts `{ username, password }` to `/api/auth`, and forwards the same pair to `/api/save-articles` after verification.  
- Server-side auth no longer scans all of `process.env`; it validates by looking up the provided username directly and comparing the stored password.

**Actions taken**
1. Added the password saver UI so editors can persist their credential locally.  
2. Updated `/api/auth` and `/api/save-articles` to accept multiple environment keys (ZENBY, KOSM, COE, JOSIE, WITCHY, ARCTIC, ADMIN_PASSWORD) and scan all env vars for matches.  
3. Surfaced the resolved key in the GitHub card (“Ready to commit as …”) to show which user is authenticated.  
4. Clarified that “Save draft” must be pressed before committing, since the dataset changelog only reflects saved drafts.  
5. Added edge-runtime safeguards so `process.env` access works even when the object is proxied.  
6. Wrapped `/api/auth` in a try/catch, added detailed console logging (password length, loaded keys, direct env checks) for Vercel diagnostics.  
7. Removed fallback iteration over `process.env` and now require explicit key declarations via `DEFAULT_PASSWORD_KEYS`/`DEV_PASSWORD_KEYS`.  
8. Converted the password saver into a `<form>` to eliminate Chrome’s “password field not in a form” warning while keeping local persistence.  
9. Added a temporary `/api/test-env` endpoint to confirm env variable availability (to be removed post-debug).  
10. Switched the credential saver to collect a username + password pair, persist both locally, and block commits until both fields are saved.  
11. Replaced `findPasswordKey` usage with a new `verifyCredentials` helper that performs direct env lookups by username.  
12. Updated `/api/auth` and `/api/save-articles` to require usernames, return the matching key on success, and use it for change log attribution.  
13. Confirmed production requests now send `{ username, password }` but `/api/auth` responds with 500 despite the credential refactor.  
14. Removed the front-end guard that required dataset changelog entries before committing and relaxed `/api/save-articles` to accept empty markdown/article lists so we can test auth independently of local draft state.  
15. Added a password visibility toggle to reduce entry errors while validating credentials.  
16. Audited Dev Tools documentation to ensure the in-report code sample matches the live username+password workflow (no lingering password-only snippets).

**Remaining symptoms**
- Post-redeploy `/api/auth` calls return 500 with the UI reporting `Authentication failed.` even when using environment-backed credentials (example: username `JOSIE`).  
- Browser console still shows `Permissions-Policy` warnings about `browsing-topics` and missing Chrome extension assets—noise unrelated to the auth failure.  
- No confirmation yet from Vercel function logs that `verifyCredentials` sees the configured environment variables or that `parseBody` receives the JSON payload; 500 stack trace still pending review.

**Next steps**
1. Pull fresh Vercel function logs for `/api/auth` immediately after a failed attempt (with the console already logging method, username visibility, and env lookups) to capture the stack trace behind the 500.  
2. Verify that the JSON body arrives intact by inspecting logged `Username received`/`Password received` values; if they are blank, investigate request parsing defaults in the deployed runtime.  
3. Confirm the environment variables (`JOSIE`, `ZENBY`, `KOSM`, `COE`, `WITCHY`, `ARCTIC`, `ADMIN_PASSWORD`, `DEV_PASSWORD_KEYS`) are set on the active Vercel deployment and match the expected secrets.  
4. Keep `/api/test-env` available to validate env exposure until the 500 is resolved, then remove it and update team documentation with the verified username list.

## Relevant Code

### Password helper (`api/_utils/passwords.js`)
```js
const DEFAULT_PASSWORD_KEYS = ["ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];

const getEnv = () => {
  if (typeof process === "undefined" || typeof process.env !== "object") {
    return {};
  }
  return process.env;
};

const parseAdditionalKeys = () => {
  const env = getEnv();
  const raw = env.DEV_PASSWORD_KEYS;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const getValidUsernames = () => {
  return [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys()];
};

export const verifyCredentials = (username, password) => {
  if (typeof username !== "string" || typeof password !== "string") {
    return false;
  }

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length === 0 || trimmedPassword.length === 0) {
    return false;
  }

  const validUsernames = getValidUsernames();
  if (!validUsernames.includes(trimmedUsername)) {
    return false;
  }

  const env = getEnv();
  const expectedPassword = env[trimmedUsername];

  if (typeof expectedPassword !== "string") {
    return false;
  }

  return expectedPassword.trim() === trimmedPassword;
};

export const loadPasswordEntries = () => {
  const seen = new Set();
  const entries = [];
  const keys = getValidUsernames();
  const env = getEnv();

  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const value = env[key];
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    entries.push({ key, value: trimmed });
  }

  return entries;
};

export const findPasswordKey = (password, entries = loadPasswordEntries()) => {
  if (typeof password !== "string") {
    return null;
  }

  const trimmed = password.trim();
  if (trimmed.length === 0) {
    return null;
  }

  for (const entry of entries) {
    if (entry.value === trimmed) {
      return entry.key;
    }
  }

  return null;
};
```

### Auth endpoint (`api/auth.js`)
```js
import { verifyCredentials, getValidUsernames } from "./_utils/passwords";

const parseBody = (rawBody) => {
  if (rawBody == null) {
    return {};
  }

  if (typeof rawBody === "string" && rawBody.trim().length > 0) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  if (typeof rawBody === "object") {
    return rawBody;
  }

  return {};
};

export default async function handler(req, res) {
  console.log("=== AUTH ENDPOINT CALLED ===");
  console.log("Method:", req.method);

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    console.log("=== CREDENTIALS DEBUG ===");
    console.log("Username received:", username ? "YES" : "NO");
    console.log("Username value:", username);
    console.log("Password received:", password ? "YES" : "NO");
    console.log("Password length:", password.length);

    console.log("=== ENVIRONMENT CHECK ===");
    const validUsernames = getValidUsernames();
    console.log("Valid usernames:", validUsernames.join(", "));
    console.log("Username is valid:", validUsernames.includes(username.trim()));

    const expectedPassword = process.env[username.trim()];
    console.log(`process.env.${username.trim()}:`, expectedPassword ? `EXISTS (${expectedPassword.length} chars)` : "UNDEFINED");

    console.log("=== VERIFYING CREDENTIALS ===");
    const isValid = verifyCredentials(username, password);

    if (!isValid) {
      console.error("❌ AUTHENTICATION FAILED");
      if (!validUsernames.includes(username.trim())) {
        console.error("Reason: Invalid username");
        return res.status(401).json({ error: "Invalid username." });
      }

      if (!expectedPassword) {
        console.error("Reason: Username not configured in environment");
        return res.status(500).json({ error: "Configuration error." });
      }

      console.error("Reason: Password mismatch");
      return res.status(401).json({ error: "Invalid password." });
    }

    console.log("✓ AUTHENTICATION SUCCESSFUL:", username.trim());
    return res.status(200).json({ authorized: true, key: username.trim() });
  } catch (error) {
    console.error("=== AUTH ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Stack trace:", error.stack);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
```

### Save endpoint (auth section) — `api/save-articles.js`
```js
import { verifyCredentials } from "./_utils/passwords";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    return res.status(500).json({ error: "Required environment variables are missing." });
  }

  const body = parseBody(req.body);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length === 0 || trimmedPassword.length === 0) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const isValid = verifyCredentials(trimmedUsername, trimmedPassword);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const passwordKey = trimmedUsername;
  // ... remainder commits to GitHub and returns entry with submittedBy
}
```

### Dev Tools credential saver (`src/components/pages/DevModePage.tsx` excerpt)
```tsx
const PASSWORD_STORAGE_KEY = "dosewiki-dev-password";
const [username, setUsername] = useState("");
const [usernameDraft, setUsernameDraft] = useState("");
const [adminPassword, setAdminPassword] = useState("");
const [passwordDraft, setPasswordDraft] = useState("");

const handleCredentialsSave = useCallback(
  (event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
    if (event && "preventDefault" in event) {
      event.preventDefault();
    }

    const trimmedUsernameDraft = usernameDraft.trim();
    const trimmedPasswordDraft = passwordDraft.trim();

    if (trimmedUsernameDraft.length === 0 && trimmedPasswordDraft.length === 0) {
      setUsername("");
      setUsernameDraft("");
      setAdminPassword("");
      setPasswordDraft("");
      setPasswordKey(null);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
          showPasswordNotice({ type: "success", message: "Saved credentials cleared." });
        } catch {
          showPasswordNotice({
            type: "error",
            message: "Credentials cleared for this session. Clear local storage manually to remove saved data.",
          });
        }
      } else {
        showPasswordNotice({ type: "success", message: "Saved credentials cleared." });
      }
      return;
    }

    if (trimmedUsernameDraft.length === 0 || trimmedPasswordDraft.length === 0) {
      showPasswordNotice({ type: "error", message: "Enter both username and password before saving." });
      return;
    }

    setUsername(trimmedUsernameDraft);
    setUsernameDraft(trimmedUsernameDraft);
    setAdminPassword(trimmedPasswordDraft);
    setPasswordDraft(trimmedPasswordDraft);
    setPasswordKey(null);

    if (typeof window === "undefined") {
      showPasswordNotice({ type: "success", message: "Credentials ready for this session." });
      return;
    }

    try {
      const payload = JSON.stringify({ username: trimmedUsernameDraft, password: trimmedPasswordDraft });
      window.localStorage.setItem(PASSWORD_STORAGE_KEY, payload);
      showPasswordNotice({ type: "success", message: "Credentials saved locally." });
    } catch {
      showPasswordNotice({
        type: "error",
        message: "Unable to access local storage; credentials kept for this session.",
      });
    }
  },
  [passwordDraft, showPasswordNotice, usernameDraft],
);

<form className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4" onSubmit={handleCredentialsSave}>
  <div className="flex-1 space-y-3">
    <div>
      <label htmlFor="dev-mode-saved-username" className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">
        Username (ENV key)
      </label>
      <input
        id="dev-mode-saved-username"
        type="text"
        className={baseInputClass}
        placeholder="Enter your username"
        autoComplete="username"
        value={usernameDraft}
        onChange={(event) => setUsernameDraft(event.target.value)}
        onKeyDown={handleCredentialInputKeyDown}
      />
    </div>
    <div>
      <label htmlFor="dev-mode-saved-password" className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">
        User password
      </label>
      <input
        id="dev-mode-saved-password"
        type="password"
        className={baseInputClass}
        placeholder="Paste your user password"
        autoComplete="current-password"
        value={passwordDraft}
        onChange={(event) => setPasswordDraft(event.target.value)}
        onKeyDown={handleCredentialInputKeyDown}
      />
    </div>
  </div>
  <button type="submit" className="flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400 hover:bg-fuchsia-500/20 hover:text-white">
    <Save className="h-4 w-4" />
    Save
  </button>
</form>
```

### Dev Tools integration — `src/components/pages/DevModePage.tsx`
```tsx
const [username, setUsername] = useState("");
const [usernameDraft, setUsernameDraft] = useState("");
const [adminPassword, setAdminPassword] = useState("");
const [passwordDraft, setPasswordDraft] = useState("");
const [passwordKey, setPasswordKey] = useState<string | null>(null);
const [isPasswordVisible, setIsPasswordVisible] = useState(false);

const handleCredentialsSave = useCallback(
  (event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
    if (event && "preventDefault" in event) {
      event.preventDefault();
    }

    const trimmedUsernameDraft = usernameDraft.trim();
    const trimmedPasswordDraft = passwordDraft.trim();

    if (trimmedUsernameDraft.length === 0 && trimmedPasswordDraft.length === 0) {
      setUsername("");
      setUsernameDraft("");
      setAdminPassword("");
      setPasswordDraft("");
      setPasswordKey(null);
      setIsPasswordVisible(false);
      window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
      showPasswordNotice({ type: "success", message: "Saved credentials cleared." });
      return;
    }

    if (trimmedUsernameDraft.length === 0 || trimmedPasswordDraft.length === 0) {
      showPasswordNotice({ type: "error", message: "Enter both username and password before saving." });
      return;
    }

    setUsername(trimmedUsernameDraft);
    setUsernameDraft(trimmedUsernameDraft);
    setAdminPassword(trimmedPasswordDraft);
    setPasswordDraft(trimmedPasswordDraft);
    setPasswordKey(null);
    setIsPasswordVisible(false);

    const payload = JSON.stringify({ username: trimmedUsernameDraft, password: trimmedPasswordDraft });
    window.localStorage.setItem(PASSWORD_STORAGE_KEY, payload);
    showPasswordNotice({ type: "success", message: "Credentials saved locally." });
  },
  [passwordDraft, showPasswordNotice, usernameDraft],
);

const handleSaveToGitHub = useCallback(async () => {
  const trimmedUsernameValue = username.trim();
  const trimmedPassword = adminPassword.trim();
  if (!trimmedUsernameValue || !trimmedPassword) {
    setGithubNotice({ type: "error", message: "Save your username and password above before committing." });
    return;
  }

  if (hasInvalidJsonDraft) {
    setGithubNotice({ type: "error", message: "Fix JSON syntax before committing." });
    return;
  }

  const commitMessage = `Dev editor update - ${new Date().toLocaleString()}`;

  try {
    setIsSaving(true);
    setGithubNotice({ type: "success", message: "Verifying credentials…" });

    const authResponse = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: trimmedUsernameValue, password: trimmedPassword }),
    });

    const authPayload = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || authPayload.authorized !== true) {
      throw new Error(authPayload.error || "Authentication failed.");
    }

    const matchedKey =
      typeof authPayload.key === "string" && authPayload.key.trim().length > 0 ? authPayload.key.trim() : null;
    if (!matchedKey) {
      throw new Error("Authentication succeeded, but no username was returned.");
    }

    setPasswordKey(matchedKey);
    showPasswordNotice({ type: "success", message: `Verified as ${matchedKey}.` });
    setGithubNotice({ type: "success", message: `Credentials verified for ${matchedKey}. Saving to GitHub…` });

    const saveResponse = await fetch("/api/save-articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: trimmedUsernameValue,
        password: trimmedPassword,
        articlesData: articles,
        commitMessage,
        changelogMarkdown: datasetChangelog.markdown,
        changedArticles: datasetChangelog.articles,
      }),
    });

    const result = await saveResponse.json().catch(() => ({}));

    if (!saveResponse.ok) {
      throw new Error(result.details || result.error || "Save failed.");
    }

    const resolvedKey =
      typeof result.submittedBy === "string" && result.submittedBy.trim().length > 0
        ? result.submittedBy.trim()
        : matchedKey;
    setPasswordKey(resolvedKey);

    const commitNotice = result.commitUrl ? `Saved to GitHub. Commit → ${result.commitUrl}` : "Saved to GitHub.";
    setGithubNotice({ type: "success", message: commitNotice });

    if (result.entry && typeof result.entry === "object") {
      const entry = result.entry as ChangeLogEntry;
      const sanitizedEntry: ChangeLogEntry = {
        ...entry,
        commit: {
          sha: entry.commit?.sha ?? "",
          url: entry.commit?.url ?? "",
          message: entry.commit?.message ?? commitMessage,
        },
        submittedBy: entry.submittedBy ?? resolvedKey,
      };
      setChangeLogEntries((previous) => appendChangeLogEntry(previous, sanitizedEntry));
      setActiveTab("changelog");
      pushChangeLogNotice({ type: "success", message: "Commit logged in the Change log tab." });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected error.";
    setGithubNotice({ type: "error", message: reason });
  } finally {
    setIsSaving(false);
    window.setTimeout(() => setGithubNotice(null), 10000);
  }
}, [
  adminPassword,
  appendChangeLogEntry,
  articles,
  datasetChangelog.articles,
  datasetChangelog.markdown,
  hasInvalidJsonDraft,
  pushChangeLogNotice,
  showPasswordNotice,
  username,
]);
```

**Last updated:** 2024-12-05
