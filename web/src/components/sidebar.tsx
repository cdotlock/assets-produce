"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { clearToken, getToken } from "@/lib/auth-client"

const NAV = [
  { href: "/", label: "Chat" },
  { href: "/projects", label: "Projects" },
  { href: "/assets", label: "Assets" },
  { href: "/skills", label: "Skills" },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const tok = getToken()
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: tok ? { authorization: `Bearer ${tok}` } : {},
      })
    } catch {
      // best-effort; clear local state regardless
    }
    clearToken()
    router.push("/login")
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      <div className="px-4 py-5">
        <h1 className="text-base font-semibold tracking-tight">assets-produce</h1>
        <p className="text-xs text-muted-foreground">creator workspace</p>
      </div>
      <Separator />
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "block rounded-md px-3 py-2 text-sm transition-colors " +
                (active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <Button variant="ghost" size="sm" className="w-full" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </aside>
  )
}
