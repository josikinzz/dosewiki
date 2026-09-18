"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@server/auth/passwordPolicy";
import { normalizeUsername, validateUsername } from "@server/auth/usernamePolicy";

type InviteRedeemFormProps = {
  /** The `?code=` from the invite link, if any; the field stays editable. */
  initialCode: string;
  /** Where to land once signed in. */
  destination: string;
};

/**
 * Accept an invite: choose a username and password, optionally a name and a
 * real email, then sign straight in. The redeem route owns every refusal
 * message; the form only pre-checks what it can without the server (password
 * policy, username shape, matching confirmation) so a typo never costs a
 * rate-limited round trip.
 */
export function InviteRedeemForm({ initialCode, destination }: InviteRedeemFormProps) {
  const [code, setCode] = useState(initialCode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || accountCreated) return;
    setError(null);
    setStatusMessage(null);

    if (code.trim().length === 0) {
      setError("Enter your invite code.");
      return;
    }
    const usernameProblem = validateUsername(normalizeUsername(username));
    if (usernameProblem) {
      setError(usernameProblem);
      return;
    }
    const passwordProblem = validateNewPassword(password);
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Creating your account…");

    let response: Response;
    try {
      response = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, username, password, name, email }),
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setError("Network error. Check your connection and try again.");
      return;
    }

    const payload: { error?: unknown; username?: unknown } = await response.json().catch(() => ({}));
    if (!response.ok) {
      setIsSubmitting(false);
      setStatusMessage(null);
      setError(typeof payload.error === "string" ? payload.error : "Unable to create your account right now.");
      return;
    }

    setAccountCreated(true);
    setStatusMessage("Account created. Signing you in…");
    try {
      const result = await signIn("credentials", {
        username: typeof payload.username === "string" ? payload.username : normalizeUsername(username),
        password,
        callbackUrl: destination,
        redirect: false,
      });
      if (!result || result.error) {
        throw new Error("Sign-in did not complete.");
      }
      setStatusMessage("Signed in. Redirecting to the editor…");
      window.location.href = result.url ?? destination;
    } catch {
      setStatusMessage(null);
      setError("Your account was created but sign-in did not complete. Sign in with your new username and password. You do not need to use the invite again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorId = error ? "invite-redeem-error" : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-describedby={errorId}>
      <fieldset disabled={isSubmitting || accountCreated} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"
          required
          className="font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-username">Username</Label>
        <Input
          id="invite-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <p className="theme-text-faint text-xs">
          3 to 32 characters: lowercase letters, digits, underscores or dashes. This is what you sign in with.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password">Password</Label>
        <div className="relative">
          <Input
            id="invite-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            className="pr-11"
          />
          <Button
            type="button"
            variant="iconGhost"
            size="quiet"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2"
          >
            <Icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} size={16} className="h-4 w-4" />
          </Button>
        </div>
        <p className="theme-text-faint text-xs">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-confirm">Confirm password</Label>
        <Input
          id="invite-confirm"
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email (optional)</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>
      </div>
      </fieldset>

      {error ? (
        <Alert id={errorId} variant="destructive">
          <Icon icon="lucide:alert-circle" size={16} />
          <AlertTitle>{accountCreated ? "Account created: sign in to continue" : "Could not accept the invite"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <p role="status" aria-live="polite" className="theme-text-secondary flex min-h-5 items-center gap-2 text-sm">
        {!error && statusMessage ? (
          <>
            <Icon icon="lucide:loader-circle" size={16} className={isSubmitting ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{statusMessage}</span>
          </>
        ) : null}
      </p>

      {accountCreated ? (
        !isSubmitting ? (
          <Button asChild variant="accent" className="min-h-11 w-full justify-center">
            <a href="/sign-in">Continue to sign in</a>
          </Button>
        ) : null
      ) : (
        <Button type="submit" variant="accent" disabled={isSubmitting} className="min-h-11 w-full justify-center">
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      )}
    </form>
  );
}
