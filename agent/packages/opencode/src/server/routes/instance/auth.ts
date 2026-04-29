import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Effect, Layer } from "effect"
import { randomBytes } from "crypto"
import { lazy } from "@/util/lazy"
import { verifyPassword, signJwt, hashPassword } from "@/auth/web"
import { defaultLayer as userBusinessLayer } from "@/business/user/user"
import { defaultLayer as sessionTokenBusinessLayer } from "@/business/session-token/session-token"
import { Service as UserService } from "@/business/user/user"
import { Service as SessionTokenService } from "@/business/session-token/session-token"
import { jsonRequest, runRequest } from "./trace"

const LoginBody = z.object({
  username: z.string(),
  password: z.string(),
})

const LoginResponse = z.object({
  token: z.string(),
  expires_at: z.number(),
  refresh_token: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    role: z.enum(["admin", "creator"]),
  }),
})

const MeResponse = z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
    role: z.enum(["admin", "creator"]),
    profile: z.enum(["creator", "developer"]),
  }),
})

const authLayer = Layer.mergeAll(userBusinessLayer, sessionTokenBusinessLayer)

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const JWT_TTL_SECONDS = 43200

export const AuthRoutes = lazy(() =>
  new Hono()
    .post(
      "/login",
      describeRoute({
        summary: "Login with username and password",
        operationId: "auth.login",
        responses: {
          200: {
            description: "Login successful",
            content: { "application/json": { schema: resolver(LoginResponse) } },
          },
          401: { description: "Invalid credentials" },
        },
      }),
      validator("json", LoginBody),
      async (c) => {
        const { username, password } = c.req.valid("json")
        return jsonRequest("AuthRoutes.login", c, function* () {
          return yield* Effect.gen(function* () {
            const users = yield* UserService
            const tokens = yield* SessionTokenService

            const user = yield* users.getByUsername(username)
            if (!user || !user.password_hash) {
              c.status(401)
              return { error: "invalid credentials" } as const
            }

            const valid = yield* Effect.promise(() => verifyPassword(password, user.password_hash!))
            if (!valid) {
              c.status(401)
              return { error: "invalid credentials" } as const
            }

            const token = yield* Effect.promise(() =>
              signJwt(
                { sub: user.id, username: user.username, role: user.role, profile: "creator" },
                { expiresInSeconds: JWT_TTL_SECONDS },
              ),
            )

            const rawRefresh = randomBytes(32).toString("hex")
            const refreshHash = yield* Effect.promise(() => hashPassword(rawRefresh))
            const expiresAt = Date.now() + REFRESH_TTL_MS

            yield* tokens.create({
              userId: user.id,
              tokenHash: refreshHash,
              expiresAt,
            })

            return {
              token,
              expires_at: Date.now() + JWT_TTL_SECONDS * 1000,
              refresh_token: rawRefresh,
              user: {
                id: user.id,
                username: user.username,
                role: user.role,
              },
            } as const
          }).pipe(Effect.provide(authLayer))
        })
      },
    )
    .post(
      "/logout",
      describeRoute({
        summary: "Revoke all active tokens for the authenticated user",
        operationId: "auth.logout",
        responses: {
          204: { description: "Logged out" },
          401: { description: "Unauthorized" },
        },
      }),
      async (c) => {
        if (!c.var.user) {
          c.status(401)
          return c.json({ error: "unauthorized" })
        }
        const user = c.var.user
        await runRequest(
          "AuthRoutes.logout",
          c,
          Effect.gen(function* () {
            const tokens = yield* SessionTokenService
            yield* tokens.revokeAllForUser(user.sub)
          }).pipe(Effect.provide(sessionTokenBusinessLayer)),
        )
        return new Response(null, { status: 204 })
      },
    )
    .get(
      "/me",
      describeRoute({
        summary: "Get current authenticated user",
        operationId: "auth.me",
        responses: {
          200: {
            description: "Current user",
            content: { "application/json": { schema: resolver(MeResponse) } },
          },
          401: { description: "Unauthorized" },
        },
      }),
      async (c) => {
        if (!c.var.user) {
          c.status(401)
          return c.json({ error: "unauthorized" })
        }
        const user = c.var.user
        return jsonRequest("AuthRoutes.me", c, function* () {
          return {
            user: {
              id: user.sub,
              username: user.username,
              role: user.role,
              profile: user.profile,
            },
          }
        })
      },
    ),
)
