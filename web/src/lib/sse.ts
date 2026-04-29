export interface AgentEvent {
  type: string
  properties: Record<string, unknown> & { sessionID?: string }
}

export interface SseHandlers {
  onEvent?: (e: AgentEvent) => void
  onError?: (err: Event) => void
  onOpen?: () => void
}

export function connectAgentEvents(
  baseUrl: string,
  token: string,
  handlers: SseHandlers,
): EventSource {
  const url = `${baseUrl}/event?token=${encodeURIComponent(token)}`
  const es = new EventSource(url)
  if (handlers.onOpen) es.addEventListener("open", handlers.onOpen)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as AgentEvent
      handlers.onEvent?.(data)
    } catch (err) {
      console.error("[sse] parse error", err, e.data)
    }
  }
  if (handlers.onError) es.onerror = handlers.onError
  return es
}
