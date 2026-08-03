import Link from "next/link"
import { GameRow } from "@/components/GameRow"
import type { Game } from "@/lib/api"

interface UpNextRailProps {
  games: Game[]
}

export function UpNextRail({ games }: UpNextRailProps) {
  return (
    <aside className="rail-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-display text-sm uppercase tracking-[0.15em] text-foreground">Up Next</h2>
        <Link
          href="/rankings"
          className="text-[10px] font-display uppercase tracking-wider text-primary hover:underline"
        >
          Rankings
        </Link>
      </div>
      <div className="flex-1">
        {games.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No upcoming games.</p>
        ) : (
          games.map((game) => <GameRow key={game.id} game={game} />)
        )}
      </div>
      {games.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <Link
            href="/"
            className="text-xs font-display uppercase tracking-wider text-primary hover:underline"
          >
            View full schedule →
          </Link>
        </div>
      )}
    </aside>
  )
}
