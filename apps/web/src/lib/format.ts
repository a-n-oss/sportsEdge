import { formatDistanceToNow, parseISO } from "date-fns"

export function formatUpdatedAgo(iso: string | null | undefined): string {
  if (!iso) return "Data pending"
  try {
    return `Updated ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`
  } catch {
    return "Updated recently"
  }
}

export function formatProb(prob: number): string {
  return `${Math.round(prob * 100)}%`
}

export function formatElo(rating: number): string {
  return String(Math.round(rating))
}
