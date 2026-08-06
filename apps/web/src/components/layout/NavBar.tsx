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
      <div className="container mx-auto max-w-full px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 md:gap-6">
            <Link
              href="/"
              className="shrink-0 font-display text-lg uppercase tracking-tight sm:text-xl"
            >
              <span className="text-foreground">Sports</span>
              <span className="text-primary">Edge</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-2 py-2 font-display text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <p className="shrink-0 truncate font-mono-stat text-[10px] text-muted-foreground sm:text-[11px]">
            {formatUpdatedAgo(lastRefresh)}
          </p>
        </div>
        <div className="-mx-3 flex h-10 items-center overflow-hidden border-t border-border/60 px-3 sm:-mx-4 sm:px-4">
          <Suspense fallback={<div className="skeleton h-5 w-48 rounded" />}>
            <LeagueTabs leagues={leagues} />
          </Suspense>
        </div>
        <nav className="scrollbar-none -mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-2 font-display text-xs uppercase tracking-wide md:hidden sm:-mx-4 sm:px-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 shrink-0 items-center px-2.5 text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
