"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CredentialsSignInFormProps = {
  callbackUrl: string;
};

export function CredentialsSignInForm({ callbackUrl }: CredentialsSignInFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage("Checking your credentials…");
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error === "RateLimited") {
      setStatusMessage(null);
      setError("Too many sign-in attempts from this network. Wait a few minutes and try again.");
      return;
    }

    if (!result || result.error) {
      setStatusMessage(null);
      setError("Username or password didn't match. Check for typos, or ask an admin to reset your password.");
      return;
    }

    setStatusMessage("Signed in. Redirecting to the editor…");
    window.location.href = result.url ?? callbackUrl;
  };

  const errorId = error ? "credentials-sign-in-error" : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          variant={error ? "error" : "default"}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            variant={error ? "error" : "default"}
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

        {error ? (
          <Alert id={errorId} variant="destructive">
            <Icon icon="lucide:alert-circle" size={16} />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="theme-text-secondary flex min-h-5 items-center gap-2 text-sm"
      >
        {!error && statusMessage ? (
          <>
            <Icon
              icon="lucide:loader-circle"
              size={16}
              className={isSubmitting ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            <span>{statusMessage}</span>
          </>
        ) : null}
      </p>

      <Button
        type="submit"
        variant="accent"
        disabled={isSubmitting}
        className="min-h-11 w-full justify-center"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
