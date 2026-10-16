const MAILING_LIST_SUBSCRIBE_URL = "/api/subscribe"

export type MailingList = "dosewiki" | "effectindex";

export type MailingListSignupResult = { ok: true } | { ok: false; message: string };

const RATE_LIMIT_MESSAGE = "Too many tries just now. Give it a minute.";
const INVALID_MESSAGE = "That doesn't look like an email address.";
const NETWORK_MESSAGE = "Couldn't reach the signup service. Try again in a moment.";
const UNAVAILABLE_MESSAGE = "The signup service is temporarily unavailable. Try again in a moment.";

export async function postMailingListSignup(
  email: string,
  list: MailingList,
  website: string,
): Promise<MailingListSignupResult> {
  let response: Response;
  try {
    response = await fetch(MAILING_LIST_SUBSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, list, website }),
    });
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  }

  if (response.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    message: response.status === 400
      ? INVALID_MESSAGE
      : response.status === 429
        ? RATE_LIMIT_MESSAGE
        : UNAVAILABLE_MESSAGE,
  };
}
