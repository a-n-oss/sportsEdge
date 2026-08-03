import Link from "next/link"
import { Suspense } from "react"
import { LeagueTabs } from "./LeagueTabs"
import { formatUpdatedAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/rankings", label: "Rankings" },
  { href: "/teams", label: "Teams" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/about", label: "About" },
] as const

interface NavBarProps {
  leagues: string[]
  lastRefresh: string | null
}

export function NavBar({ leagues, lastRefresh }: NavBarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="shrink-0 font-display text-xl uppercase tracking-tight">
              <span className="text-foreground">Sports</span>
              <span className="text-primary">Edge</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-sm">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide text-xs font-display"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono-stat shrink-0">
            {formatUpdatedAgo(lastRefresh)}
          </p>
        </div>
        <div className="flex h-10 items-center border-t border-border/60 -mx-4 px-4">
          <Suspense fallback={<div className="h-5 w-48 skeleton rounded" />}>
            <LeagueTabs leagues={leagues} />
          </Suspense>
        </div>
        <nav className="flex md:hidden items-center gap-3 pb-2 overflow-x-auto text-xs font-display uppercase tracking-wide">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
