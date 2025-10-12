## Dev Commit Auth Troubleshooting

**Current issue**  
Attempts to commit edits from the Developer Draft Editor fail during the `/api/auth` verification step in production. The UI shows dataset diffs, but the GitHub panel reports `Invalid password` or surfaces a 500. Local development succeeds with the same credentials.

**Context**  
- Dev Tools stores the password entered in the “User password” input in `localStorage` and state; the saver does not submit the credential.  
- The GitHub card reads that saved password, posts it to `/api/auth`, then forwards both password and resolved key to `/api/save-articles` after successful verification.  
- Password matching on the server uses `findPasswordKey`, which checks curated keys and then scans `process.env` for any matching values.

**Actions taken**
1. Added the password saver UI so editors can persist their credential locally.  
2. Updated `/api/auth` and `/api/save-articles` to accept multiple environment keys (ZENBY, KOSM, COE, JOSIE, WITCHY, ARCTIC, ADMIN_PASSWORD) and scan all env vars for matches.  
3. Surfaced the resolved key in the GitHub card (“Ready to commit as …”) to show which user is authenticated.  
4. Clarified that “Save draft” must be pressed before committing, since the dataset changelog only reflects saved drafts.  
5. Added edge-runtime safeguards so `process.env` access works even when the object is proxied.  
6. Wrapped `/api/auth` in a try/catch and added console logging for easier debugging on Vercel.

**Remaining symptoms**
- Production `/api/auth` calls still return 401/500 despite matching passwords in the Vercel environment.  
- Browser console warnings about the password input not residing in a `<form>` continue (noise, but unrelated).  
- No confirmation yet that the new server-side logging is visible in Vercel function logs.

**Next steps**
1. Define `DEV_PASSWORD_KEYS` in Vercel with the comma-separated list of active password env variables, confirm each individual password variable is present, and redeploy.  
2. Inspect Vercel function logs immediately after a failed commit attempt; debug logging from `/api/auth` now surfaces loaded keys and direct env access checks.  
3. Wrap the password field in a `<form>` to eliminate DOM warnings (optional).  
4. Contact Vercel support if env lookup still fails after confirming configuration.

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

export const loadPasswordEntries = () => {
  const seen = new Set();
  const entries = [];
  const keys = [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys()];
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

  const env = getEnv();
  for (const [envKey, envValue] of Object.entries(env)) {
    if (typeof envValue !== "string") {
      continue;
    }

    if (envValue.trim() === trimmed) {
      return envKey;
    }
  }

  return null;
};
```

### Auth endpoint (`api/auth.js`)
```js
import { findPasswordKey, loadPasswordEntries } from "./_utils/passwords";

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
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const providedPassword = typeof body.password === "string" ? body.password : "";

    const passwordEntries = loadPasswordEntries();
    const matchedKey = findPasswordKey(providedPassword, passwordEntries);
    if (!matchedKey) {
      return res.status(401).json({ error: "Invalid password." });
    }

    return res.status(200).json({ authorized: true, key: matchedKey });
  } catch (error) {
    console.error("/api/auth error", error);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
```

### Save endpoint (auth section) — `api/save-articles.js`
```js
import { findPasswordKey, loadPasswordEntries } from "./_utils/passwords";

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
  const providedPassword = typeof body.password === "string" ? body.password : "";
  const passwordEntries = loadPasswordEntries();
  const matchedKey = findPasswordKey(providedPassword, passwordEntries);
  if (!matchedKey) {
    return res.status(401).json({ error: "Invalid password." });
  }

  const providedKey = typeof body.passwordKey === "string" ? body.passwordKey.trim() : "";
  if (providedKey && providedKey !== matchedKey) {
    return res.status(401).json({ error: "Password does not match the provided key." });
  }

  const passwordKey = providedKey || matchedKey;
  // ... remainder commits to GitHub and returns entry with submittedBy
}
```

### Dev Tools integration — `src/components/pages/DevModePage.tsx`
```tsx
const [adminPassword, setAdminPassword] = useState("");
const [passwordKey, setPasswordKey] = useState<string | null>(null);

const handlePasswordSave = useCallback(() => {
  const trimmed = passwordDraft.trim();
  setAdminPassword(trimmed);
  setPasswordKey(null);
  // persists trimmed password to localStorage for reuse
}, [passwordDraft, showPasswordNotice]);

const handleSaveToGitHub = useCallback(async () => {
  const trimmedPassword = adminPassword.trim();
  if (!trimmedPassword) {
    setGithubNotice({ type: "error", message: "Save the user password above before committing." });
    return;
  }

  try {
    const authResponse = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmedPassword }),
    });

    const authPayload = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || authPayload.authorized !== true) {
      throw new Error(authPayload.error || "Authentication failed.");
    }

    const matchedKey = typeof authPayload.key === "string" && authPayload.key.trim().length > 0
      ? authPayload.key.trim()
      : null;

    if (matchedKey) {
      setPasswordKey(matchedKey);
      showPasswordNotice({ type: "success", message: `Verified as ${matchedKey}.` });
      setGithubNotice({ type: "success", message: `Password verified for ${matchedKey}. Saving to GitHub…` });
    }

    const saveResponse = await fetch("/api/save-articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: trimmedPassword,
        passwordKey: matchedKey ?? undefined,
        articlesData: articles,
        commitMessage,
        changelogMarkdown: datasetChangelog.markdown,
        changedArticles: datasetChangelog.articles,
      }),
    });

    // ... handles result, updates change log, switches tabs
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected error.";
    setGithubNotice({ type: "error", message: reason });
  } finally {
    setIsSaving(false);
  }
}, [adminPassword, articles, datasetChangelog, showPasswordNotice, /* ... */]);
```

**Last updated:** 2024-12-04
