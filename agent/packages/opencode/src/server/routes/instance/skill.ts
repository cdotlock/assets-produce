import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Effect, Layer } from "effect"
import { lazy } from "@/util/lazy"
import { errors } from "../../error"
import { jsonRequest, runRequest } from "./trace"
import { SkillCli, type ContentSource } from "@/business/skill/cli"
import { defaultLayer as skillBusinessLayer } from "@/business/skill/skill"
import { defaultLayer as langfuseLayer } from "@/langfuse/langfuse"

const ScopeEnum = z.enum(["system", "creator"])

const SkillInfo = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  langfuse_prompt_key: z.string(),
  langfuse_label: z.string(),
  scope: ScopeEnum,
  enabled: z.boolean(),
  attachments: z.unknown().nullable(),
  time_created: z.number(),
  time_updated: z.number(),
})

const ListQuery = z.object({
  scope: ScopeEnum.optional(),
  enabled_only: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
})

const CreateBody = z
  .object({
    name: z.string(),
    description: z.string(),
    content_body: z.string().optional(),
    content_url: z.string().optional(),
    langfuse_prompt_key: z.string().optional(),
    label: z.string().optional(),
    scope: ScopeEnum.optional(),
    enabled: z.boolean().optional(),
    attachments: z.unknown().optional(),
    dry_run: z.boolean().optional(),
  })
  .refine(
    (b) =>
      [b.content_body, b.content_url, b.langfuse_prompt_key].filter((v) => typeof v === "string" && v.length > 0)
        .length === 1,
    { message: "exactly one of content_body / content_url / langfuse_prompt_key required" },
  )

const PatchBody = z
  .object({
    description: z.string().optional(),
    content_body: z.string().optional(),
    content_url: z.string().optional(),
    label: z.string().optional(),
    scope: ScopeEnum.optional(),
    enabled: z.boolean().optional(),
    attachments: z.unknown().optional(),
    dry_run: z.boolean().optional(),
  })
  .refine(
    (b) =>
      [b.content_body, b.content_url].filter((v) => typeof v === "string" && v.length > 0).length <= 1,
    { message: "at most one of content_body / content_url allowed" },
  )

const skillsLayer = Layer.mergeAll(skillBusinessLayer, langfuseLayer)

export const SkillRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List skills",
        operationId: "skill.list",
        responses: {
          200: {
            description: "List of skills",
            content: {
              "application/json": {
                schema: resolver(z.object({ skills: SkillInfo.array() })),
              },
            },
          },
        },
      }),
      validator("query", ListQuery),
      async (c) =>
        jsonRequest("SkillRoutes.list", c, function* () {
          const query = c.req.valid("query")
          const rows = yield* SkillCli.listSkills({
            scope: query.scope,
            enabledOnly: Boolean(query.enabled_only),
          }).pipe(Effect.provide(skillsLayer))
          return { skills: rows }
        }),
    )
    .get(
      "/:name",
      describeRoute({
        summary: "Get a skill by name",
        operationId: "skill.get",
        responses: {
          200: {
            description: "Skill",
            content: { "application/json": { schema: resolver(SkillInfo) } },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        const result = await runRequest(
          "SkillRoutes.get",
          c,
          SkillCli.showSkill(name).pipe(Effect.provide(skillsLayer)),
        )
        if (!result) {
          c.status(404)
          return c.json({ error: `skill not found: ${name}` })
        }
        return c.json(result.row)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create a skill",
        operationId: "skill.create",
        responses: {
          200: {
            description: "Created",
            content: { "application/json": { schema: resolver(z.object({}).passthrough()) } },
          },
          ...errors(400),
        },
      }),
      validator("json", CreateBody),
      async (c) =>
        jsonRequest("SkillRoutes.create", c, function* () {
          const body = c.req.valid("json")
          let source: ContentSource
          if (typeof body.content_body === "string") source = { kind: "inline", body: body.content_body }
          else if (typeof body.content_url === "string") source = { kind: "url", url: body.content_url }
          else if (typeof body.langfuse_prompt_key === "string")
            source = { kind: "langfuse-key", key: body.langfuse_prompt_key }
          else {
            c.status(400)
            return { error: "missing source" } as never
          }
          return yield* SkillCli.addSkill({
            name: body.name,
            description: body.description,
            source,
            label: body.label,
            scope: body.scope,
            enabled: body.enabled,
            attachments: body.attachments,
            dryRun: body.dry_run,
          }).pipe(Effect.provide(skillsLayer))
        }),
    )
    .patch(
      "/:name",
      describeRoute({
        summary: "Update a skill",
        operationId: "skill.update",
        responses: {
          200: {
            description: "Updated",
            content: { "application/json": { schema: resolver(z.object({}).passthrough()) } },
          },
          ...errors(404, 400),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      validator("json", PatchBody),
      async (c) =>
        jsonRequest("SkillRoutes.update", c, function* () {
          const { name } = c.req.valid("param")
          const body = c.req.valid("json")
          let source: ContentSource | undefined
          if (typeof body.content_body === "string") source = { kind: "inline", body: body.content_body }
          else if (typeof body.content_url === "string") source = { kind: "url", url: body.content_url }
          return yield* SkillCli.updateSkill({
            name,
            description: body.description,
            source,
            label: body.label,
            scope: body.scope,
            enabled: body.enabled,
            attachments: body.attachments,
            dryRun: body.dry_run,
          }).pipe(Effect.provide(skillsLayer))
        }),
    )
    .delete(
      "/:name",
      describeRoute({
        summary: "Delete a skill (DB row only; Langfuse prompt is preserved)",
        operationId: "skill.delete",
        responses: {
          200: {
            description: "Deleted",
            content: { "application/json": { schema: resolver(z.object({ deleted: z.boolean() })) } },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) =>
        jsonRequest("SkillRoutes.delete", c, function* () {
          const { name } = c.req.valid("param")
          yield* SkillCli.deleteSkill(name).pipe(Effect.provide(skillsLayer))
          return { deleted: true }
        }),
    ),
)
