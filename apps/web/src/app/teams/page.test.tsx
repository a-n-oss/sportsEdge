import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TeamsDirectory from "./page"
import { STUB_HEADER_NOTE } from "../../lib/league"

const getLeagues = vi.fn()
const getTeams = vi.fn()
const getStandings = vi.fn()

vi.mock("@/lib/api", () => ({
  getLeagues: (...args: unknown[]) => getLeagues(...args),
  getTeams: (...args: unknown[]) => getTeams(...args),
  getStandings: (...args: unknown[]) => getStandings(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("TeamsDirectory", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getLeagues.mockReset()
    getTeams.mockReset()
    getStandings.mockReset()
    getLeagues.mockResolvedValue([
      { key: "nfl", ready: false },
      { key: "nba", ready: true },
    ])
    getStandings.mockResolvedValue([
      {
        rank: 1,
        team_id: 2,
        league: "nba",
        name: "Boston Celtics",
        abbreviation: "BOS",
        elo_rating: 1480,
      },
    ])
  })

  it("keeps stub teams off All", async () => {
    getTeams.mockResolvedValue([
      { id: 2, league: "nba", name: "Boston Celtics", abbreviation: "BOS" },
      { id: 99, league: "nhl", name: "Stub Club", abbreviation: "STB" },
    ])
    render(await TeamsDirectory({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Boston Celtics")).toBeTruthy()
    expect(screen.queryByText("Stub Club")).toBeNull()
    expect(screen.queryByText(STUB_HEADER_NOTE)).toBeNull()
  })

  it("shows the Limited header note for a stub chip", async () => {
    getTeams.mockResolvedValue([])
    render(await TeamsDirectory({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
    expect(screen.getByText("No teams found.")).toBeTruthy()
  })

  it("lists teams for a stub chip when the directory has rows", async () => {
    getTeams.mockResolvedValue([
      { id: 99, league: "nhl", name: "Stub Club", abbreviation: "STB" },
    ])
    getStandings.mockResolvedValue([])
    render(await TeamsDirectory({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
    expect(screen.getByText("Stub Club")).toBeTruthy()
    expect(screen.getAllByText("NHL").length).toBeGreaterThan(0)
  })

  it("falls back when teams or leagues fail to load", async () => {
    getTeams.mockRejectedValue(new Error("teams down"))
    getLeagues.mockRejectedValue(new Error("leagues down"))
    render(await TeamsDirectory({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("No teams found.")).toBeTruthy()
  })
})
