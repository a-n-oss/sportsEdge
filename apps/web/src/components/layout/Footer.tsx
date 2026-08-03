export function Footer() {
  return (
    <footer className="border-t border-border py-6">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 md:flex-row px-4">
        <p className="text-center text-xs text-muted-foreground md:text-left font-mono-stat uppercase tracking-wider">
          SportsEdge Elo Model
        </p>
        <p className="text-center text-xs text-muted-foreground md:text-right">
          Predictions are for entertainment purposes only. Not affiliated with any league.
        </p>
      </div>
    </footer>
  )
}
