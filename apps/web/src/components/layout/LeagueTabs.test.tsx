import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LeagueInfo } from "../../lib/league"
import { STUB_TOOLTIP } from "../../lib/league"
import { LeagueTabs } from "./LeagueTabs"

const nav = vi.hoisted(() => ({ pathname: "/", league: null as string | null }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => ({
    get: (key: string) => (key === "league" ? nav.league : null),
  }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode
    href: string
    title?: string
    className?: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const LEAGUES: LeagueInfo[] = [
  { key: "nfl", ready: true },
  { key: "nba", ready: true },
  { key: "nhl", ready: false },
]

describe("LeagueTabs", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    nav.pathname = "/"
    nav.league = null
  })

  it("keeps every league chip visible with title-case labels", () => {
    render(<LeagueTabs leagues={LEAGUES} />)
    expect(screen.getByRole("link", { name: "All" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "NFL" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "NBA" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "NHL Limited" })).toBeTruthy()
  })

  it("marks stub leagues with a muted Limited pill and seeding tooltip", () => {
    render(<LeagueTabs leagues={LEAGUES} />)
    const nhl = screen.getByRole("link", { name: "NHL Limited" })
    expect(nhl.textContent).toMatch(/Limited/)
    expect(nhl.getAttribute("title")).toBe(STUB_TOOLTIP)
    expect(screen.getByRole("link", { name: "NFL" }).textContent).not.toMatch(/Limited/)
    expect(screen.getByRole("link", { name: "All" }).textContent).not.toMatch(/Limited/)
  })

  it("keeps Limited on the active stub chip", () => {
    nav.league = "nhl"
    render(<LeagueTabs leagues={LEAGUES} />)
    const nhl = screen.getByRole("link", { name: "NHL Limited" })
    expect(nhl.textContent).toMatch(/Limited/)
    expect(nhl.className).toMatch(/text-primary/)
  })
})
