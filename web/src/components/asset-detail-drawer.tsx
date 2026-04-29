"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { AssetInfo } from "@/types/api"

interface Props {
  asset: AssetInfo | null
  onOpenChange: (open: boolean) => void
}

export function AssetDetailDrawer({ asset, onOpenChange }: Props) {
  return (
    <Drawer open={asset !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        {asset ? (
          <>
            <DrawerHeader>
              <DrawerTitle>{asset.title ?? asset.key}</DrawerTitle>
              <DrawerDescription>
                {asset.type} · v{asset.version} · {new Date(asset.time_created).toISOString()}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-6 pb-6 space-y-4">
              {asset.url ? (
                asset.type === "image" ? (
                  <img src={asset.url} alt={asset.title ?? asset.key} className="max-h-96 rounded-md" />
                ) : asset.type === "video" ? (
                  <video src={asset.url} controls className="max-h-96 rounded-md" />
                ) : (
                  <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Open asset →
                  </a>
                )
              ) : null}
              {asset.prompt ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                  <p className="text-sm whitespace-pre-wrap">{asset.prompt}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium text-muted-foreground">ID</p>
                <p className="text-xs font-mono">{asset.id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Project</p>
                <p className="text-xs font-mono">{asset.project_id}</p>
              </div>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
