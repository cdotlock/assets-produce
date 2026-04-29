let memoryToken: string | null = null

export function getToken(): string | null {
  return memoryToken
}

export function setToken(t: string | null): void {
  memoryToken = t
}

export function clearToken(): void {
  memoryToken = null
}

export interface AuthUser {
  id: string
  username: string
  role: "admin" | "creator"
  profile?: "creator" | "developer"
}

export interface LoginResponse {
  token: string
  expires_at: number
  user: AuthUser
}
