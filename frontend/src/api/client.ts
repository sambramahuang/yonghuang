import type {
  Artefact,
  ArtefactVersion,
  ImpactDetail,
  ImpactSummary,
  LoginResponse,
  RegulatoryUpdate,
  RejectionReason,
  SystemStatus,
  User,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3001/api";

// The backend has no login route by design: tokens are minted by an operator
// (`npm run token -- reviewer|approver`) and pasted in. We keep the active one
// in localStorage so a page reload does not drop the session mid-demo.
const TOKEN_KEY = "yonghuang.token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing: fall through, requests just go unauthenticated */
  }
}

export class ApiError extends Error {
  // Declared and assigned explicitly: the project sets `erasableSyntaxOnly`,
  // which disallows TypeScript parameter properties.
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // fetch rejects identically for a dead server and a blocked CORS response,
    // so name both causes rather than sending the reader after the wrong one.
    // The browser console distinguishes them; the UI cannot.
    throw new ApiError(
      0,
      `Cannot reach the API at ${BASE}. Check that the backend is running (\`npm start\`), and ` +
        `that this page's origin (${window.location.origin}) is listed in the backend's CORS_ORIGIN.`,
    );
  }

  if (!response.ok) {
    // Errors come back as { error: "..." }; fall back to the status text.
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<{ status: string; extraction_mode: string }>("/health"),
  login: (username: string, password: string) =>
    post<LoginResponse>("/login", { username, password }),
  me: () => request<User>("/me"),
  users: () => request<User[]>("/users"),

  artefacts: () => request<Artefact[]>("/artefacts"),
  // Full text: every segment of the artefact's analysed version, not just the
  // ones with a finding, so the reader sees the whole document in context.
  artefact: (id: string) =>
    request<
      Artefact & { segments: { id: number; ordinal: number; locator: string; text: string; char_start: number }[] }
    >(`/artefacts/${id}`),

  regulatoryUpdates: () => request<RegulatoryUpdate[]>("/regulatory-updates"),
  analyse: (updateId: string) =>
    post<{ created: number; suppressed?: number }>(`/regulatory-updates/${updateId}/analyse`),

  impacts: (params: { update_id?: string; status?: SystemStatus; open?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.update_id) search.set("update_id", params.update_id);
    if (params.status) search.set("status", params.status);
    if (params.open !== undefined) search.set("open", String(params.open));
    const query = search.toString();
    return request<ImpactSummary[]>(`/impacts${query ? `?${query}` : ""}`);
  },
  impact: (id: string) => request<ImpactDetail>(`/impacts/${id}`),

  // Every mutation carries `revision` for optimistic concurrency: the backend
  // rejects the write if someone else has touched the finding since we read it.
  editPatch: (id: string, revision: number, replacement: string) =>
    request<ImpactDetail>(`/impacts/${id}/patch`, {
      method: "PATCH",
      body: JSON.stringify({ revision, new: replacement }),
    }),
  submit: (id: string, revision: number) => post<ImpactDetail>(`/impacts/${id}/submit`, { revision }),
  // Approve is the one endpoint that wraps its result: it also returns the
  // artefact version the approval created.
  approve: (id: string, revision: number) =>
    post<{ impact: ImpactDetail; version: ArtefactVersion }>(`/impacts/${id}/approve`, { revision }),
  // Accepts a finding that proposes no edit — nothing is written to the
  // artefact, the finding is simply resolved as accepted.
  accept: (id: string, revision: number) => post<ImpactDetail>(`/impacts/${id}/accept`, { revision }),
  reject: (id: string, revision: number, rejection_reason: RejectionReason) =>
    post<ImpactDetail>(`/impacts/${id}/reject`, { revision, rejection_reason }),
  escalate: (id: string, revision: number) => post<ImpactDetail>(`/impacts/${id}/escalate`, { revision }),
};
