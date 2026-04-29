export const AGENT_BASE_URL =
  process.env.NEXT_PUBLIC_AGENT_HTTP_BASE_URL ?? "http://127.0.0.1:8001"

export class AgentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(
      `agent ${status}: ${typeof body === "object" ? JSON.stringify(body) : body}`,
    )
  }
}

export interface AgentClient {
  request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T>
  get<T>(path: string, opts?: { token?: string }): Promise<T>
  post<T>(path: string, body?: unknown, opts?: { token?: string }): Promise<T>
  patch<T>(path: string, body?: unknown, opts?: { token?: string }): Promise<T>
  delete<T>(path: string, opts?: { token?: string }): Promise<T>
}

export function createAgentClient(opts?: { baseUrl?: string }): AgentClient {
  const base = opts?.baseUrl ?? AGENT_BASE_URL

  async function request<T>(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<T> {
    const { token, headers: initHeaders, ...rest } = init
    const headers = new Headers(initHeaders as HeadersInit | undefined)
    if (token) headers.set("Authorization", `Bearer ${token}`)
    if (init.body && !headers.has("content-type"))
      headers.set("content-type", "application/json")
    const res = await fetch(`${base}${path}`, {
      ...rest,
      headers,
      credentials: "include",
    })
    const ct = res.headers.get("content-type") ?? ""
    const body = ct.includes("application/json")
      ? await res.json()
      : await res.text()
    if (!res.ok) throw new AgentApiError(res.status, body)
    return body as T
  }

  return {
    request,
    get: (path, o) => request(path, { method: "GET", token: o?.token }),
    post: (path, body, o) =>
      request(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
        token: o?.token,
      }),
    patch: (path, body, o) =>
      request(path, {
        method: "PATCH",
        body: JSON.stringify(body ?? {}),
        token: o?.token,
      }),
    delete: (path, o) => request(path, { method: "DELETE", token: o?.token }),
  }
}

export const agentClient = createAgentClient()
