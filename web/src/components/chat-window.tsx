"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { agentClient, AGENT_BASE_URL } from "@/lib/agent-client"
import { getToken } from "@/lib/auth-client"
import { connectAgentEvents, type AgentEvent } from "@/lib/sse"
import { StreamingMessage, type ChatMessage, type ChatPart } from "@/components/streaming-message"

export function ChatWindow() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Keep a ref to sessionId so event handler closure always reads current value
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Open SSE on mount
  useEffect(() => {
    const tok = getToken()
    if (!tok) return
    const es = connectAgentEvents(AGENT_BASE_URL, tok, {
      onEvent: handleEvent,
      onError: (e) => {
        console.error("[chat] sse error", e)
        setError("connection lost; refresh to reconnect")
      },
    })
    esRef.current = es
    return () => {
      es.close()
      esRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleEvent(ev: AgentEvent) {
    const evSessionId = ev.properties.sessionID
    const currentSessionId = sessionIdRef.current
    if (currentSessionId && evSessionId && evSessionId !== currentSessionId) return

    if (ev.type === "message.created" || ev.type === "message.updated") {
      const info = (ev.properties as { info?: { id: string; role: "user" | "assistant" } }).info
      if (!info) return
      setMessages((prev) => upsertMessage(prev, { id: info.id, role: info.role, parts: [] }))
      return
    }

    if (ev.type === "part.created" || ev.type === "part.updated") {
      const partProp = (
        ev.properties as { part?: { id: string; messageID: string; data?: Record<string, unknown> } }
      ).part
      if (!partProp) return
      const data = partProp.data
      const kind: "text" | "tool" | null =
        data?.type === "text" ? "text" : data?.type === "tool" ? "tool" : null
      if (!kind) return
      const chatPart: ChatPart = { id: partProp.id, kind }
      if (kind === "text") {
        chatPart.text = typeof data?.text === "string" ? data.text : ""
      } else {
        chatPart.tool = typeof data?.tool === "string" ? data.tool : undefined
        const rawState = data?.state
        if (
          rawState === "pending" ||
          rawState === "running" ||
          rawState === "completed" ||
          rawState === "error"
        ) {
          chatPart.state = rawState
        }
        const output = typeof data?.output === "string" ? data.output : undefined
        chatPart.output = output
        if (output) {
          const m = output.match(/https?:\/\/\S+/)
          if (m) chatPart.url = m[0]
        }
      }
      setMessages((prev) => upsertPart(prev, partProp.messageID, chatPart))
      return
    }

    if (ev.type === "session.error") {
      const errProp = (ev.properties as { error?: { message?: string } }).error
      setError(errProp?.message ?? "session error")
      setBusy(false)
      return
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || busy) return
    setError(null)
    setBusy(true)
    const tok = getToken()
    if (!tok) {
      setError("not authenticated")
      setBusy(false)
      return
    }
    try {
      let sid = sessionId
      if (!sid) {
        const res = await agentClient.post<{ id: string }>("/session", {}, { token: tok })
        sid = res.id
        setSessionId(sid)
        sessionIdRef.current = sid
      }
      const userMsgId = `user_${Date.now()}`
      const userPartId = `p_${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          parts: [{ id: userPartId, kind: "text", text: input }],
        },
      ])
      const text = input
      setInput("")
      await agentClient.post(`/session/${sid}/prompt_async`, { parts: [{ type: "text", text }] }, { token: tok })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAbort() {
    if (!sessionId) return
    const tok = getToken()
    if (!tok) return
    try {
      await agentClient.post(`/session/${sessionId}/abort`, {}, { token: tok })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Start a conversation. Try:{" "}
            <code className="bg-muted rounded px-1">use the novel-to-video skill on this passage…</code>
          </p>
        ) : (
          messages.map((m) => <StreamingMessage key={m.id} message={m} />)
        )}
      </div>
      {error ? (
        <div className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <form onSubmit={handleSend} className="border-t border-border p-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          rows={2}
          className="flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (e.currentTarget.form) e.currentTarget.form.requestSubmit()
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={!input.trim() || busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleAbort} disabled={!sessionId}>
            Abort
          </Button>
        </div>
      </form>
    </div>
  )
}

function upsertMessage(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const idx = prev.findIndex((m) => m.id === msg.id)
  if (idx === -1) return [...prev, msg]
  const next = [...prev]
  next[idx] = { ...prev[idx], ...msg, parts: prev[idx].parts } // preserve parts
  return next
}

function upsertPart(prev: ChatMessage[], messageId: string, part: ChatPart): ChatMessage[] {
  const idx = prev.findIndex((m) => m.id === messageId)
  if (idx === -1) {
    // message hasn't arrived yet — create a stub
    return [...prev, { id: messageId, role: "assistant", parts: [part] }]
  }
  const msg = prev[idx]
  const partIdx = msg.parts.findIndex((p) => p.id === part.id)
  const newParts =
    partIdx === -1
      ? [...msg.parts, part]
      : msg.parts.map((p, i) => (i === partIdx ? { ...p, ...part } : p))
  const next = [...prev]
  next[idx] = { ...msg, parts: newParts }
  return next
}
