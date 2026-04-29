"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { AssetDetailDrawer } from "@/components/asset-detail-drawer"
import { agentClient } from "@/lib/agent-client"
import { getToken } from "@/lib/auth-client"
import type { AssetInfo, AssetsListResponse } from "@/types/api"

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<AssetInfo | null>(null)

  useEffect(() => {
    const tok = getToken()
    if (!tok) return
    agentClient
      .get<AssetsListResponse>("/assets?limit=50", { token: tok })
      .then((r) => setAssets(r.assets))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Assets</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assets yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <Card
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(a)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setDetail(a)
              }}
              className="cursor-pointer hover:bg-accent transition-colors"
            >
              <CardContent className="p-3 space-y-2">
                <div className="aspect-square overflow-hidden rounded-md bg-muted">
                  {a.url && a.type === "image" ? (
                    <img src={a.url} alt={a.title ?? a.key} className="h-full w-full object-cover" />
                  ) : a.url && a.type === "video" ? (
                    <video src={a.url} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {a.type}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium truncate">{a.title ?? a.key}</p>
                  <p className="text-xs text-muted-foreground">{a.type} · v{a.version}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AssetDetailDrawer asset={detail} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </div>
  )
}
