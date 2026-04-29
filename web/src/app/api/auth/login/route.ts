import { NextRequest, NextResponse } from "next/server"

const AGENT = process.env.NEXT_PUBLIC_AGENT_HTTP_BASE_URL ?? "http://127.0.0.1:8001"

export async function POST(req: NextRequest) {
  const body = await req.text()
  const upstream = await fetch(`${AGENT}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
  const respBody = await upstream.text()
  const res = new NextResponse(respBody, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  })
  // Forward agent's Set-Cookie (refresh_token) to the browser, rewriting
  // Path/Domain so the cookie is scoped to the Next.js origin.
  const setCookie = upstream.headers.get("set-cookie")
  if (setCookie) {
    // Strip any Domain= attribute the agent might have set; let the browser
    // default to the Next.js origin (localhost:3000 in dev).
    const rewritten = setCookie.replace(/;\s*domain=[^;]+/i, "")
    res.headers.set("set-cookie", rewritten)
  }
  return res
}
