import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import AppError from "./error"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("app error boundary", () => {
  it("does not bind the global Error identifier", () => {
    expect(AppError.name).not.toBe("Error")
  })

  it("explains the failure and lets the user retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const reset = vi.fn()
    const failure = Object.assign(new Error("analytics engine unreachable"), {
      digest: "digest-1",
    })

    render(<AppError error={failure} reset={reset} />)

    expect(screen.getByRole("heading", { name: "Something went wrong!" })).toBeTruthy()
    screen.getByRole("button", { name: "Try again" }).click()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
