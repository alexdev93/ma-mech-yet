// No "server-only" import: proxy.ts reads these names, and it must not pull in session or database code.

// __Host- cookies must be Secure with Path=/ and no Domain, which pins them to this exact origin.
// Browsers reject Secure cookies over plain http, so development drops the prefix.
const prefix = process.env.NODE_ENV === "production" ? "__Host-" : ""

export const SESSION_COOKIE = `${prefix}session`
export const LOGIN_STATE_COOKIE = `${prefix}tg-login`
