"use client"

import { Card, CardContent } from "@/components/ui/card"

export interface ChatPart {
  id: string
  kind: "text" | "tool"
  // text
  text?: string
  // tool
  tool?: string
  state?: "pending" | "running" | "completed" | "error"
  output?: string
  url?: string // OSS URL when result includes one
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  parts: ChatPart[]
}

export function StreamingMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[80%] space-y-2">
        {message.parts.map((p) =>
          p.kind === "text" ? (
            <div
              key={p.id}
              className={
                "rounded-md px-4 py-3 text-sm whitespace-pre-wrap " +
                (isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")
              }
            >
              {p.text ?? ""}
            </div>
          ) : (
            <ToolPartCard key={p.id} part={p} />
          ),
        )}
      </div>
    </div>
  )
}

function ToolPartCard({ part }: { part: ChatPart }) {
  const status = part.state ?? "pending"
  const dotColor =
    status === "completed"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : status === "running"
          ? "bg-amber-500 animate-pulse"
          : "bg-muted-foreground"
  return (
    <Card className="border-dashed">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="font-mono">{part.tool ?? "tool"}</span>
          <span className="text-muted-foreground">{status}</span>
        </div>
        {part.url ? (
          <a
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline break-all"
          >
            {part.url}
          </a>
        ) : null}
        {part.output && !part.url ? (
          <pre className="text-xs bg-muted rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap">
            {part.output}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}
