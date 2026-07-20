import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Activity } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SportsEdge - Predictive Sports Analytics",
  description: "Advanced predictive sports analytics engine utilizing Elo ratings and statistical modeling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-16 items-center px-4">
              <Link href="/" className="flex items-center space-x-2 mr-6 text-primary">
                <Activity className="h-6 w-6" />
                <span className="font-bold text-xl tracking-tight text-foreground">SportsEdge</span>
              </Link>
              <nav className="flex items-center space-x-6 text-sm font-medium">
                <Link href="/" className="transition-colors hover:text-foreground/80 text-foreground/60">
                  Dashboard
                </Link>
                <Link href="/teams" className="transition-colors hover:text-foreground/80 text-foreground/60">
                  Teams
                </Link>
                <Link href="/accuracy" className="transition-colors hover:text-foreground/80 text-foreground/60">
                  Accuracy
                </Link>
                <Link href="/about" className="transition-colors hover:text-foreground/80 text-foreground/60">
                  About
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 container mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="border-t py-6 md:py-0">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row px-4">
              <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                Built by the SportsEdge team. Predictions are for entertainment purposes only.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
