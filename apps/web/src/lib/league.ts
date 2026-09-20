export const DEFAULT_ELO = 1500

export const STUB_TOOLTIP = "Ratings still seeding — probabilities may look flat."

export const STUB_HEADER_NOTE = "Limited — many clubs still at default Elo (1500)."

export const EMPTY_BOARD_COPY = {
  stub: {
    title: "Limited coverage — ratings still seeding.",
    detail: "Check back after the next sync.",
  },
  ready: {
    title: "No games on the board right now.",
    detail: "Check back closer to tip-off.",
  },
} as const

export interface LeagueInfo {
  key: string
  ready: boolean
}

export interface EmptyBoardCopy {
  title: string
  detail: string
}

export function isLeagueReady(input: {
  ratings: number[]
  upcomingEloPairs: Array<[number, number]>
  serverReady?: boolean
}): boolean {
  if (input.serverReady) return true
  if (input.ratings.some((rating) => rating !== DEFAULT_ELO)) return true
  return input.upcomingEloPairs.some(([home, away]) => home !== away)
}

export function formatLeagueLabel(key: string): string {
  return key.toUpperCase()
}

export function emptyBoardCopy(ready: boolean): EmptyBoardCopy {
  return ready ? EMPTY_BOARD_COPY.ready : EMPTY_BOARD_COPY.stub
}

export function readyLeagueKeys(leagues: LeagueInfo[]): string[] {
  return leagues.filter((league) => league.ready).map((league) => league.key.toLowerCase())
}

export function selectVisibleItems<T extends { league: string }>(
  items: T[],
  selectedLeague: string | undefined,
  readyKeys: Set<string>
): T[] {
  if (selectedLeague) {
    const selected = selectedLeague.toLowerCase()
    return items.filter((item) => item.league.toLowerCase() === selected)
  }
  return items.filter((item) => readyKeys.has(item.league.toLowerCase()))
}

export function isSelectedLeagueReady(
  selectedLeague: string | undefined,
  readyKeys: Set<string>
): boolean {
  if (!selectedLeague) return true
  return readyKeys.has(selectedLeague.toLowerCase())
}

export function leagueChipBasePath(pathname: string): string {
  if (pathname.startsWith("/rankings")) return "/rankings"
  if (pathname.startsWith("/teams")) return "/teams"
  if (pathname.startsWith("/history")) return "/history"
  if (pathname.startsWith("/accuracy")) return "/accuracy"
  return "/"
}

export function leaguesToQuery(selectedLeague: string | undefined, readyKeys: string[]): string[] {
  if (selectedLeague) return [selectedLeague.toLowerCase()]
  return readyKeys
}

export function fallbackLeagues(): LeagueInfo[] {
  return ["nfl", "nba", "mlb", "nhl", "epl"].map((key) => ({ key, ready: true }))
}
