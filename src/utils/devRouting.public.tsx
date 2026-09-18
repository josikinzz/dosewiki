import { devHref } from "./devHref";

export default {
  path: devHref,
  // Editor URLs hand off in middleware before public rendering. They are not public views.
  parse(): null { return null; },
};
