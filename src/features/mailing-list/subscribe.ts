/**
 * The portal-wide mailing-list signup endpoint, served as a Convex HTTP action by this
 * repo's production deployment (`prod:glad-minnow-656`). One endpoint serves every site
 * in the portal; the `list` value keeps each publication's signups on its own list, so
 * dose.wiki and Effect Index each hardcode their own value at their call site.
 */
export const MAILING_LIST_API_ORIGIN = "https://glad-minnow-656.convex.site";

export const MAILING_LIST_SUBSCRIBE_URL = `${MAILING_LIST_API_ORIGIN}/subscribe`;

/** The two lists this repository's publications write to. */
export type MailingList = "dosewiki" | "effectindex";

export type MailingListSignupResult = { ok: true } | { ok: false; message: string };

const RATE_LIMIT_MESSAGE = "Too many tries just now. Give it a minute.";
const INVALID_MESSAGE = "That doesn't look like an email address.";
const NETWORK_MESSAGE = "Couldn't reach the signup service. Try again in a moment.";

/**
 * POST one signup. The endpoint answers 200 for accepted *and* already-subscribed
 * addresses (no enumeration), 400 for an invalid email or unknown list, and 429 when
 * rate limited. `website` is the form's honeypot value, forwarded verbatim — humans
 * leave it empty, and the endpoint quietly accepts non-empty submissions without
 * subscribing them.
 */
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
    message: response.status === 429 ? RATE_LIMIT_MESSAGE : INVALID_MESSAGE,
  };
}
