import * as bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

export interface JwtPayload {
  sub: string
  username: string
  role: "admin" | "creator"
  profile: "creator" | "developer"
  iat?: number
  exp?: number
}

const VALID_ROLES = new Set(["admin", "creator"])
const VALID_PROFILES = new Set(["creator", "developer"])

let secretCache: Uint8Array | null = null
let secretCacheRaw: string | null = null

export function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET ?? ""
  if (raw === secretCacheRaw && secretCache) return secretCache
  if (!raw || raw.length < 32) throw new Error("JWT_SECRET env var required (≥32 chars)")
  const encoded = new TextEncoder().encode(raw)
  secretCache = encoded
  secretCacheRaw = raw
  return encoded
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(password, hash)
}

export async function signJwt(
  payload: { sub: string; username: string; role: "admin" | "creator"; profile: "creator" | "developer" },
  opts?: { expiresInSeconds?: number },
): Promise<string> {
  if (!VALID_ROLES.has(payload.role)) throw new Error("invalid role")
  if (!VALID_PROFILES.has(payload.profile)) throw new Error("invalid profile")

  const secret = getJwtSecret()
  const expiresInSeconds = opts?.expiresInSeconds ?? 43200
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    username: payload.username,
    role: payload.role,
    profile: payload.profile,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const secret = getJwtSecret()
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] })
  return {
    sub: payload.sub as string,
    username: payload["username"] as string,
    role: payload["role"] as "admin" | "creator",
    profile: payload["profile"] as "creator" | "developer",
    iat: payload.iat,
    exp: payload.exp,
  }
}
