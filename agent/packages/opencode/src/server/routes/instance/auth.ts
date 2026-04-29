import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Effect, Layer } from "effect"
import { randomBytes } from "crypto"
import { lazy } from "@/util/lazy"
import { AppRuntime } from "@/effect/app-runtime"
import { verifyPassword, signJwt, hashPassword } from "@/auth/web"
import { defaultLayer as userBusinessLayer } from "@/business/user/user"
import { defaultLayer as sessionTokenBusinessLayer } from "@/business/session-token/session-token"
import { Service as UserService } from "@/business/user/user"
import { Service as SessionTokenService } from "@/business/session-token/session-token"

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

        const result = await AppRuntime.runPromise(
          Effect.gen(function* () {
            const users = yield* UserService
            const tokens = yield* SessionTokenService

            const user = yield* users.getByUsername(username)
            if (!user || !user.password_hash) return null

            const valid = yield* Effect.promise(() => verifyPassword(password, user.password_hash!))
            if (!valid) return null

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

            return { token, refreshToken: rawRefresh, user }
          }).pipe(Effect.provide(authLayer)),
        )

        if (!result) {
          c.status(401)
          return c.json({ error: "invalid credentials" })
        }

        const jwtExpiresAt = Date.now() + JWT_TTL_SECONDS * 1000

        return c.json({
          token: result.token,
          expires_at: jwtExpiresAt,
          refresh_token: result.refreshToken,
          user: {
            id: result.user.id,
            username: result.user.username,
            role: result.user.role,
          },
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
        const user = c.var.user
        if (!user) {
          c.status(401)
          return c.json({ error: "unauthorized" })
        }

        await AppRuntime.runPromise(
          Effect.gen(function* () {
            const tokens = yield* SessionTokenService
            yield* tokens.revokeAllForUser(user.sub)
          }).pipe(Effect.provide(sessionTokenBusinessLayer)),
        )

        c.status(204)
        return c.body(null)
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
        const user = c.var.user
        if (!user) {
          c.status(401)
          return c.json({ error: "unauthorized" })
        }

        return c.json({
          user: {
            id: user.sub,
            username: user.username,
            role: user.role,
            profile: user.profile,
          },
        })
      },
    ),
)
