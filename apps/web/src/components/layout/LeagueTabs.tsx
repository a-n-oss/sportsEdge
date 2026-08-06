"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

interface LeagueTabsProps {
  leagues: string[]
}

export function LeagueTabs({ leagues }: LeagueTabsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeLeague = searchParams.get("league")?.toLowerCase() ?? null

  const basePath = pathname.startsWith("/rankings")
    ? "/rankings"
    : pathname.startsWith("/teams")
      ? "/teams"
      : "/"

  return (
    <div className="scrollbar-none flex w-full items-center gap-1 overflow-x-auto">
      <Link
        href={basePath}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors",
          !activeLeague
            ? "border-b-2 border-primary text-primary"
            : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        All
      </Link>
      {leagues.map((league) => {
        const slug = league.toLowerCase()
        const href = `${basePath}?league=${slug}`
        const isActive = activeLeague === slug
        return (
          <Link
            key={league}
            href={href}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors",
              isActive
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {slug}
          </Link>
        )
      })}
    </div>
  )
}
