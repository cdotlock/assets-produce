"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { agentClient } from "@/lib/agent-client"
import { getToken } from "@/lib/auth-client"
import type { ProjectsListResponse, ProjectInfo } from "@/types/api"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tok = getToken()
    if (!tok) return
    agentClient
      .get<ProjectsListResponse>("/projects", { token: tok })
      .then((r) => setProjects(r.projects))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Projects</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet. Create one via the agent CLI.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-base">{p.title}</CardTitle>
                <CardDescription>{p.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.description ?? "(no description)"}</p>
                <p className="mt-2 text-xs text-muted-foreground">id: {p.id}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
