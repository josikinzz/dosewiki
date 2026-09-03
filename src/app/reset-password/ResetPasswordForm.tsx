"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@server/auth/passwordPolicy";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const problem = validateNewPassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    } catch {
      setIsSubmitting(false);
      setError("Network error. Check your connection and try again.");
      return;
    }

    const payload: { error?: unknown } = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Unable to reset your password right now.");
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="space-y-5">
        <Alert variant="success" role="status">
          <Icon icon="lucide:badge-check" size={16} />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>Sign in with your username and the password you just set.</AlertDescription>
        </Alert>
        <Button asChild variant="accent" className="min-h-11 w-full justify-center">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  const errorId = error ? "reset-password-error" : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
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
        <p className="theme-text-faint text-xs">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          variant={error ? "error" : "default"}
        />
      </div>

      {error ? (
        <Alert id={errorId} variant="destructive">
          <Icon icon="lucide:alert-circle" size={16} />
          <AlertTitle>Password not updated</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        variant="accent"
        disabled={isSubmitting}
        className="min-h-11 w-full justify-center"
      >
        {isSubmitting ? "Saving password..." : "Set password"}
      </Button>
    </form>
  );
}
