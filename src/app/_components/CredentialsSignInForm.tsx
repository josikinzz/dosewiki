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
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage("Verifying local development credentials…");
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setStatusMessage(null);
      setError("Invalid credentials.");
      return;
    }

    setStatusMessage("Signed in. Redirecting to the editor…");
    window.location.href = result.url ?? callbackUrl;
  };

  const errorId = error ? "credentials-sign-in-error" : undefined;

  return (
    <form onSubmit={handleSubmit} className="theme-overlay-surface space-y-5 rounded-[1.5rem] border p-5 sm:p-6">
      <div className="space-y-2">
        <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">Local fallback</p>
        <p className="theme-text-secondary text-sm leading-6">
          Use the temporary development credentials only when GitHub OAuth is not available.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          variant={error ? "error" : "default"}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          variant={error ? "error" : "default"}
        />
      </div>

      {error ? (
        <Alert id={errorId} variant="destructive">
          <Icon icon="lucide:alert-circle" size={16} />
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!error && statusMessage ? (
        <Alert variant="default">
          <Icon icon="lucide:loader-circle" size={16} className={isSubmitting ? "animate-spin" : undefined} />
          <AlertTitle>{isSubmitting ? "Signing in" : "Redirecting"}</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        variant="secondary"
        disabled={isSubmitting}
        className="min-h-11 w-full justify-center transition-[transform,box-shadow] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-px hover:shadow-[0_14px_28px_-18px_rgba(244,114,182,0.7)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto"
      >
        {isSubmitting ? "Signing in…" : "Sign in with credentials"}
      </Button>
    </form>
  );
}
