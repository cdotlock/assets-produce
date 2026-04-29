"use client"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { agentClient } from "@/lib/agent-client"
import { getToken } from "@/lib/auth-client"
import type { SkillsListResponse, SkillInfo } from "@/types/api"

const LANGFUSE_HOST = process.env.NEXT_PUBLIC_LANGFUSE_HOST ?? "https://prompt.mobai-game.com"

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tok = getToken()
    if (!tok) return
    agentClient
      .get<SkillsListResponse>("/skills?scope=creator", { token: tok })
      .then((r) => setSkills(r.skills))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Skills</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No creator-scope skills yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skills.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.description}</TableCell>
                <TableCell>{s.enabled ? "yes" : "no"}</TableCell>
                <TableCell>
                  <a
                    href={`${LANGFUSE_HOST}/p/${s.langfuse_prompt_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Langfuse →
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
