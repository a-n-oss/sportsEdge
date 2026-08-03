import { cn } from "@/lib/utils"
import { monogramColors } from "@/lib/monogram"

interface TeamMonogramProps {
  abbreviation: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-8 w-8 text-[10px] rounded-md",
  md: "h-12 w-12 text-sm rounded-lg",
  lg: "h-20 w-20 text-xl rounded-xl",
} as const

export function TeamMonogram({ abbreviation, size = "md", className }: TeamMonogramProps) {
  const abbrev = abbreviation.trim().toUpperCase().slice(0, 3)
  const { bg, fg } = monogramColors(abbrev)

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-display font-bold uppercase tracking-wide shrink-0",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden
    >
      {abbrev}
    </div>
  )
}
