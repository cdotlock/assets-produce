import { NextRequest, NextResponse } from "next/server"

const AGENT = process.env.NEXT_PUBLIC_AGENT_HTTP_BASE_URL ?? "http://127.0.0.1:8001"

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const upstream = await fetch(`${AGENT}/auth/logout`, {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  })
  const res = new NextResponse(null, { status: upstream.status })
  // Clear the refresh_token cookie regardless of upstream result
  res.headers.append("set-cookie", "refresh_token=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0")
  return res
}
