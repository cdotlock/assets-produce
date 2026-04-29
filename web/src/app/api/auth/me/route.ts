import { NextRequest, NextResponse } from "next/server"

const AGENT = process.env.NEXT_PUBLIC_AGENT_HTTP_BASE_URL ?? "http://127.0.0.1:8001"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const upstream = await fetch(`${AGENT}/auth/me`, {
    headers: auth ? { authorization: auth } : {},
  })
  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  })
}
