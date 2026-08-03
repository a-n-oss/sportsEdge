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
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      <Link
        href={basePath}
        className={cn(
          "px-2.5 py-1 text-xs font-display uppercase tracking-wider transition-colors whitespace-nowrap",
          !activeLeague
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
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
              "px-2.5 py-1 text-xs font-display uppercase tracking-wider transition-colors whitespace-nowrap",
              isActive
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
            )}
          >
            {slug}
          </Link>
        )
      })}
    </div>
  )
}
