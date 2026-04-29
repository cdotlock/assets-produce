export interface SkillInfo {
  id: string
  name: string
  description: string
  langfuse_prompt_key: string
  langfuse_label: string
  scope: "system" | "creator"
  enabled: boolean
  attachments: unknown
  time_created: number
  time_updated: number
}

export interface AssetInfo {
  id: string
  project_id: string
  parent_id: string | null
  type: "image" | "video" | "audio" | "script" | "metadata"
  key: string
  title: string | null
  url: string | null
  data: unknown
  prompt: string | null
  ref_urls: unknown
  version: number
  is_current: boolean
  time_created: number
}

export interface ProjectInfo {
  id: string
  type: "novel" | "manga" | "ad" | "preset_set" | "other"
  title: string
  description: string | null
  owner_id: string
  metadata: unknown
  time_created: number
  time_updated: number
}

export interface AssetsListResponse {
  assets: AssetInfo[]
  total: number
}

export interface ProjectsListResponse {
  projects: ProjectInfo[]
}

export interface SkillsListResponse {
  skills: SkillInfo[]
}
