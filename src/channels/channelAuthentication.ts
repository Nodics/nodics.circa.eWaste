import { API, request, type Session } from "../api";

/** The accelerator selects shared account fallback or verified linked-channel sign-in. Profile alone completes cookies and issues credentials. */
type ChannelEntry = {
  contractVersion: 1;
  channel: string;
  requiresAuthentication: boolean;
  handoffToken?: string;
};

/** Executes the backend entry contract without choosing application identity or channel-login policy in the host shell. */
export async function enterChannel(
  channel: string,
  proof: string,
): Promise<Session | null> {
  const entry = await request<ChannelEntry>(
    `${API}/authentication/channels/${encodeURIComponent(channel)}/entry`,
    null,
    { proof },
    "POST",
    { timeoutMs: 15000 },
  );
  if (entry.contractVersion !== 1 || entry.channel !== channel)
    throw new Error(
      "Channel sign-in returned an unsupported response. Please reopen the application.",
    );
  if (entry.requiresAuthentication === true) return null;
  if (entry.requiresAuthentication !== false || !entry.handoffToken)
    throw new Error(
      "Channel sign-in could not be completed. Please reopen the application.",
    );
  const auth = await request<{ authToken?: string; loginId?: string }>(
    "/nodics/profile/v0/customer/browser/external/complete",
    null,
    { handoffToken: entry.handoffToken, proof },
    "POST",
    { timeoutMs: 15000 },
  );
  if (!auth.authToken || !auth.loginId)
    throw new Error(
      "The sign-in response was incomplete. Please reopen the application.",
    );
  return { token: auth.authToken, loginId: auth.loginId };
}

/** Finishes eWaste channel association after the shared Profile account form succeeds. No principal or application is supplied by the caller. */
export async function linkChannel(
  channel: string,
  proof: string,
  session: Session,
): Promise<void> {
  const result = await request<{
    contractVersion: number;
    linked: boolean;
    channel: string;
  }>(
    `${API}/authentication/channels/${encodeURIComponent(channel)}/link`,
    session,
    { proof },
  );
  if (
    result.contractVersion !== 1 ||
    result.channel !== channel ||
    result.linked !== true
  )
    throw new Error(
      "Your account signed in, but channel linking could not finish. Please try again.",
    );
}
