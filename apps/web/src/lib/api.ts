import { z } from "zod"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"

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
})
export type Accuracy = z.infer<typeof AccuracySchema>

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
    // Next.js fetch options (caching)
    next: { revalidate: 60 },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }

  const data = await response.json()
  
  // Parse and validate the JSON against our Zod schema
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

export async function getGames(): Promise<Game[]> {
  return fetchFromAPI("/games", z.array(GameSchema))
}

export async function getTeams(): Promise<Team[]> {
  return fetchFromAPI("/teams", z.array(TeamSchema))
}

export async function getTeam(id: number): Promise<Team> {
  return fetchFromAPI(`/teams/${id}`, TeamSchema)
}

export async function getTeamRatingHistory(id: number): Promise<RatingHistory[]> {
  return fetchFromAPI(`/teams/${id}/rating-history`, z.array(RatingHistorySchema))
}

export async function getAccuracy(): Promise<Accuracy> {
  return fetchFromAPI("/accuracy", AccuracySchema)
}
