import { ChatWindow } from "@/components/chat-window"

export default function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="pb-4">
        <h2 className="text-2xl font-semibold">Chat</h2>
        <p className="text-xs text-muted-foreground">SSE-streamed; tool calls render inline</p>
      </div>
      <div className="flex-1 min-h-0 border border-border rounded-md overflow-hidden">
        <ChatWindow />
      </div>
    </div>
  )
}
