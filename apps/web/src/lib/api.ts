import { z } from "zod"

// Prefer server-only API_URL (Railway private networking). NEXT_PUBLIC_API_URL
// remains a local/dev fallback. Browser code must not call the API directly.
const API_BASE_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1"

// ----------------------------------------------------------------------
// Zod Schemas matching the backend models
// ----------------------------------------------------------------------

export const TeamSchema = z.object({
  id: z.number(),
  league: z.string(),
  name: z.string(),
  abbreviation: z.string(),
})
export type Team = z.infer<typeof TeamSchema>

export const PredictionSchema = z.object({
  game_id: z.number(),
  home_win_prob: z.number(),
  away_win_prob: z.number(),
  draw_prob: z.number().nullable(),
})
export type Prediction = z.infer<typeof PredictionSchema>

export const GameSchema = z.object({
  id: z.number(),
  league: z.string(),
  date: z.string(),
  home_team_id: z.number(),
  away_team_id: z.number(),
  home_score: z.number().nullable(),
  away_score: z.number().nullable(),
  status: z.string(),
  home_team: TeamSchema.optional(),
  away_team: TeamSchema.optional(),
  prediction: PredictionSchema.optional().nullable(),
})
export type Game = z.infer<typeof GameSchema>

export const RatingHistorySchema = z.object({
  id: z.number(),
  team_id: z.number(),
  game_id: z.number().nullable(),
  elo_rating: z.number(),
  date: z.string(),
})
export type RatingHistory = z.infer<typeof RatingHistorySchema>

export const AccuracySchema = z.object({
  brier_score: z.number(),
  calibration: z.array(
    z.object({
      predicted: z.number(),
      actual: z.number(),
    })
  ),
  sample_size: z.number().optional(),
})
export type Accuracy = z.infer<typeof AccuracySchema>

export const StandingSchema = z.object({
  rank: z.number(),
  team_id: z.number(),
  league: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  elo_rating: z.number(),
  last_updated: z.string().nullable().optional(),
  trend: z.number().nullable().optional(),
})
export type Standing = z.infer<typeof StandingSchema>

export const LastRefreshSchema = z.object({
  timestamp: z.string().nullable(),
  league: z.string().nullable(),
  status: z.string().nullable(),
})
export type LastRefresh = z.infer<typeof LastRefreshSchema>

// ----------------------------------------------------------------------
// Fetch Wrapper
// ----------------------------------------------------------------------

export async function fetchFromAPI<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const response = await fetch(url, {
    next: { revalidate: 60 },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }

  const data = await response.json()

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error("Zod parse error:", parsed.error)
    throw new Error(`Data validation failed for ${url}`)
  }

  return parsed.data
}

// ----------------------------------------------------------------------
// API Methods
// ----------------------------------------------------------------------

export async function getLeagues(): Promise<string[]> {
  return fetchFromAPI("/leagues", z.array(z.string()))
}

export interface GamesQuery {
  league?: string
  status?: string
  limit?: number
}

export async function getGames(query: GamesQuery = {}): Promise<Game[]> {
  const params = new URLSearchParams()
  if (query.league) params.set("league", query.league)
  if (query.status) params.set("status", query.status)
  if (query.limit) params.set("limit", String(query.limit))
  const qs = params.toString()
  return fetchFromAPI(`/games${qs ? `?${qs}` : ""}`, z.array(GameSchema))
}

export async function getGame(id: number): Promise<Game> {
  return fetchFromAPI(`/games/${id}`, GameSchema)
}

export async function getTeams(league?: string): Promise<Team[]> {
  const qs = league ? `?league=${encodeURIComponent(league)}` : ""
  return fetchFromAPI(`/teams${qs}`, z.array(TeamSchema))
}

export async function getTeam(id: number): Promise<Team> {
  return fetchFromAPI(`/teams/${id}`, TeamSchema)
}

export async function getTeamRatingHistory(id: number): Promise<RatingHistory[]> {
  return fetchFromAPI(`/teams/${id}/rating-history`, z.array(RatingHistorySchema))
}

export async function getStandings(league: string): Promise<Standing[]> {
  return fetchFromAPI(`/leagues/${league}/standings`, z.array(StandingSchema))
}

export async function getLastRefresh(): Promise<LastRefresh> {
  return fetchFromAPI("/meta/last-refresh", LastRefreshSchema)
}

export async function getAccuracy(): Promise<Accuracy> {
  return fetchFromAPI("/accuracy", AccuracySchema)
}
