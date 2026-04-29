export interface SseHandlers<T> {
  onMessage?: (data: T) => void
  onError?: (err: Event) => void
  onOpen?: () => void
}

// EventSource doesn't natively send headers (no Authorization). For
// authenticated streams we either (a) pass token as query param via
// agent's existing `auth_token` query trick (see server/middleware.ts
// AuthMiddleware lines 48-49), or (b) proxy through a Next.js route.
// For Phase 5 dev, prefer (a): the agent supports `?auth_token=<jwt>`
// for both basic-auth and the new JWT bearer (since middleware.ts
// only sets it as Authorization: Basic). Actually for JWT we need a
// different approach — the middleware doesn't translate auth_token to
// Bearer. Recommend: use fetch-based SSE polyfill (e.g. eventsource-parser)
// instead, OR proxy through Next.js route with the cookie.
//
// For now, expose a simple connect() that hits the agent and lets the
// caller attach handlers. Auth integration is Task 7's problem.

export function connectSse<T>(
  url: string,
  handlers: SseHandlers<T>,
): EventSource {
  const es = new EventSource(url)
  if (handlers.onOpen) es.onopen = handlers.onOpen
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as T
      handlers.onMessage?.(data)
    } catch (err) {
      console.error("sse parse error", err)
    }
  }
  if (handlers.onError) es.onerror = handlers.onError
  return es
}
