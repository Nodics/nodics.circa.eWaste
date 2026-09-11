/** A deep-link code selects a record; the authenticated Waste read remains the authorization boundary. */
export function submissionLinkCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(value) ? value : undefined;
}
