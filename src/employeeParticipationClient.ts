/** Fixed Profile Employee-to-Customer contracts; terms, eligibility, canonical identity and cookie issuance remain owner-enforced. */
import { request, type Session } from "./api";
export interface EmployeeParticipationProof extends Session {
  readonly kind: "EMPLOYEE";
}
export interface ParticipationWorkspace {
  readonly enterpriseCode: "default";
  readonly participation: {
    readonly phase: "COMPLETE" | "WITHDRAWN";
    readonly revision: number;
    readonly currentTerms: boolean;
    readonly canSwitch: boolean;
  } | null;
  readonly lifecycleQualified: boolean;
  readonly terms: {
    readonly version: string;
    readonly digest: string;
    readonly documentCode: string;
    readonly title: string;
    readonly content: string;
  };
  readonly presentation: Record<
    | "title"
    | "refreshLabel"
    | "consentLabel"
    | "acceptLabel"
    | "acceptedMessage"
    | "uncertainMessage"
    | "renewLabel"
    | "withdrawLabel"
    | "withdrawReviewTitle"
    | "confirmLabel"
    | "cancelLabel",
    string
  >;
}
const fail = (): never => {
  throw new Error("The Profile response could not be confirmed.");
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const text = (value: unknown, max: number): string =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value
    : fail();
const revision = (value: unknown): number =>
  Number.isSafeInteger(value) &&
  Number(value) >= 1 &&
  Number(value) <= 2147483647
    ? Number(value)
    : fail();
/** Creates only private in-memory Employee proof; never returns it as a customer session. */
export async function authenticateParticipationEmployee(
  loginId: string,
  password: string,
): Promise<EmployeeParticipationProof> {
  if (typeof password !== "string" || !password || password.length > 10000)
    fail();
  const result = record(
    await request("/nodics/profile/v0/employee/browser/authenticate", null, {
      loginId: text(loginId, 320),
      password,
    }),
  );
  return {
    kind: "EMPLOYEE",
    token: text(result.authToken, 32768),
    loginId:
      typeof result.loginId === "string" ? text(result.loginId, 320) : loginId,
  };
}
/** Withdraws only the currently reviewed own participation; credentials and historical records stay Profile-owned. */
export async function withdrawParticipation(
  proof: EmployeeParticipationProof,
  workspace: ParticipationWorkspace,
) {
  const participation = workspace.participation;
  if (
    !workspace.lifecycleQualified ||
    !participation ||
    participation.revision >= 2147483647 ||
    participation.phase !== "COMPLETE"
  )
    return fail();
  const result = record(
    await request("/nodics/profile/v0/customer/participation/withdraw", proof, {
      revision: participation.revision,
      confirmed: true,
    }),
  );
  if (
    result.enterpriseCode !== workspace.enterpriseCode ||
    result.phase !== "WITHDRAWN" ||
    result.revision !== participation.revision + 1
  )
    fail();
}
/** Bounds and projects exact terms and owner controls without interpreting Employee proof as customer eligibility. */
export function parseParticipationWorkspace(
  value: unknown,
): ParticipationWorkspace {
  const source = record(value),
    terms = record(source.terms),
    copy = record(source.presentation);
  if (
    source.contractVersion !== 1 ||
    source.owner !== "profile" ||
    source.enterpriseCode !== "default" ||
    typeof source.lifecycleQualified !== "boolean" ||
    typeof terms.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(terms.digest)
  )
    fail();
  const presentation = {} as ParticipationWorkspace["presentation"];
  for (const key of [
    "title",
    "refreshLabel",
    "consentLabel",
    "acceptLabel",
    "acceptedMessage",
    "uncertainMessage",
    "renewLabel",
    "withdrawLabel",
    "withdrawReviewTitle",
    "confirmLabel",
    "cancelLabel",
  ] as const)
    presentation[key] = text(copy[key], 2000);
  let participation: ParticipationWorkspace["participation"] = null;
  if (source.participation !== null) {
    const state = record(source.participation);
    if (state.phase !== "COMPLETE" && state.phase !== "WITHDRAWN") fail();
    if (
      typeof state.currentTerms !== "boolean" ||
      typeof state.canSwitch !== "boolean" ||
      (state.canSwitch &&
        (!state.currentTerms || state.phase !== "COMPLETE")) ||
      (state.currentTerms && state.phase !== "COMPLETE")
    )
      fail();
    participation = {
      phase: state.phase as "COMPLETE" | "WITHDRAWN",
      revision: revision(state.revision),
      currentTerms: state.currentTerms as boolean,
      canSwitch: state.canSwitch as boolean,
    };
  }
  return {
    enterpriseCode: "default",
    participation,
    lifecycleQualified: source.lifecycleQualified as boolean,
    terms: {
      version: text(terms.version, 128),
      digest: terms.digest as string,
      documentCode: text(terms.documentCode, 192),
      title: text(terms.title, 192),
      content: text(terms.content, 100000),
    },
    presentation,
  };
}
/** Reads only the signed Employee's own workspace, with no owner/enterprise/person selectors. */
export async function inspectParticipation(proof: EmployeeParticipationProof) {
  return parseParticipationWorkspace(
    await request("/nodics/profile/v0/customer/participation/workspace", proof),
  );
}
/** Accepts/renews one reviewed current document. No registration, switch, group union or automatic retry occurs. */
export async function acceptParticipation(
  proof: EmployeeParticipationProof,
  workspace: ParticipationWorkspace,
) {
  if (
    workspace.participation?.phase === "WITHDRAWN" ||
    workspace.participation?.currentTerms === true ||
    (workspace.participation &&
      workspace.participation.revision >= 2147483647) ||
    (workspace.participation && !workspace.lifecycleQualified)
  )
    fail();
  const prior = workspace.participation?.revision;
  const result = record(
    await request(
      "/nodics/profile/v0/customer/participation/" +
        (prior ? "renew" : "accept"),
      proof,
      {
        ...(prior ? { revision: prior } : {}),
        termsVersion: workspace.terms.version,
        termsDigest: workspace.terms.digest,
        accepted: true,
      },
    ),
  );
  if (
    result.accepted !== true ||
    result.enterpriseCode !== workspace.enterpriseCode ||
    result.revision !== (prior ? prior + 1 : 1)
  )
    fail();
  return {
    revision: revision(result.revision),
    termsDigest: workspace.terms.digest,
    termsVersion: workspace.terms.version,
  };
}
/** Explicit cookie-owner switch. The caller discards Employee proof on any outcome and hands only the returned Customer access to its host. */
export async function switchParticipation(
  proof: EmployeeParticipationProof,
  workspace: ParticipationWorkspace,
): Promise<Session> {
  const participation = workspace.participation;
  if (
    !participation ||
    participation.phase !== "COMPLETE" ||
    participation.currentTerms !== true ||
    participation.canSwitch !== true
  )
    return fail();
  const result = record(
    await request(
      "/nodics/profile/v0/employee/browser/customer-participation/switch",
      proof,
      { revision: participation.revision },
    ),
  );
  if (result.enterpriseCode !== workspace.enterpriseCode) fail();
  return {
    token: text(result.authToken, 32768),
    loginId: text(result.loginId, 320),
  };
}
