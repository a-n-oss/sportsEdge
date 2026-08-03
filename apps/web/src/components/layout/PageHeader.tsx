import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  className?: string
  children?: ReactNode
}

export function PageHeader({ eyebrow, title, description, className, children }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && (
          <p className="text-xs font-display uppercase tracking-[0.2em] text-primary mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl md:text-4xl lg:text-5xl uppercase tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}
