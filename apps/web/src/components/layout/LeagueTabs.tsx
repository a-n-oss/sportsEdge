"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  STUB_TOOLTIP,
  formatLeagueLabel,
  leagueChipBasePath,
  type LeagueInfo,
} from "@/lib/league"

interface LeagueTabsProps {
  leagues: LeagueInfo[]
}

export function LeagueTabs({ leagues }: LeagueTabsProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeLeague = searchParams.get("league")?.toLowerCase() ?? null
  const basePath = leagueChipBasePath(pathname)

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
        const slug = league.key.toLowerCase()
        const href = `${basePath}?league=${slug}`
        const isActive = activeLeague === slug
        return (
          <Link
            key={league.key}
            href={href}
            title={league.ready ? undefined : STUB_TOOLTIP}
            aria-label={
              league.ready
                ? formatLeagueLabel(slug)
                : `${formatLeagueLabel(slug)} Limited`
            }
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors",
              isActive
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {formatLeagueLabel(slug)}
            {!league.ready && (
              <span className="ml-1.5 rounded-sm bg-muted px-1 py-px text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                Limited
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
