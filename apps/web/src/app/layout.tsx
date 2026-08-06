import type { Metadata } from "next"
import { JetBrains_Mono, Oswald, Source_Sans_3 } from "next/font/google"
import "./globals.css"
import { NavBar } from "@/components/layout/NavBar"
import { Footer } from "@/components/layout/Footer"
import { getLastRefresh, getLeagues } from "@/lib/api"

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
})

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "SportsEdge — Predictive Sports Analytics",
  description:
    "Elo-powered predictive sports analytics for NFL, NBA, MLB, NHL, and EPL.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [leagues, lastRefresh] = await Promise.all([
    getLeagues().catch(() => [] as string[]),
    getLastRefresh().catch(() => null),
  ])

  return (
    <html lang="en" className="dark">
      <body
        className={`${oswald.variable} ${jetbrainsMono.variable} ${sourceSans.variable} ${sourceSans.className}`}
      >
        <div className="flex min-h-screen flex-col broadcast-bg">
          <NavBar
            leagues={leagues.length > 0 ? leagues : ["nfl", "nba", "mlb", "nhl", "epl"]}
            lastRefresh={lastRefresh?.timestamp ?? null}
          />
          <main className="container mx-auto max-w-full flex-1 px-3 py-6 sm:px-4 sm:py-8">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  )
}
