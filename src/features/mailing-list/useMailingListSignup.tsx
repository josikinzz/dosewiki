"use client";

import { useState, type FormEvent } from "react";

import { postMailingListSignup, type MailingList } from "./subscribe";

export type MailingListSignupStatus = "idle" | "pending" | "success" | "error";

/**
 * The shared state machine behind every mailing-list signup form in this repo. Each
 * surface renders its own markup in its own visual voice; this hook owns what they all
 * share — the email and honeypot values, the pending/success/error lifecycle, and the
 * submit round trip. On success the surface replaces its form with a short
 * confirmation line; on error it shows `error` inline and leaves the fields editable
 * so the visitor can simply retry.
 */
export function useMailingListSignup(list: MailingList) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<MailingListSignupStatus>("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") return;
    setStatus("pending");
    const result = await postMailingListSignup(email, list, website);
    // Explicit discriminant comparison: with this repo's strictNullChecks off,
    // a truthiness `else` branch does not narrow the result union.
    if (result.ok === false) {
      setError(result.message);
      setStatus("error");
      return;
    }
    setStatus("success");
  };

  return { email, setEmail, website, setWebsite, status, error, submit };
}

/**
 * The signup honeypot, rendered inside every mailing-list form: an off-viewport (not
 * `display:none`) text field that autofill-driven bots complete and humans never see
 * or tab into. Its value is always sent; the endpoint quietly accepts non-empty
 * submissions without subscribing them. Same technique as `SiteFeedbackForm`'s
 * honeypot.
 */
export function MailingListHoneypotField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      aria-hidden="true"
    >
      <label htmlFor={id}>Website</label>
      <input
        id={id}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
