import { emptyBoardCopy } from "@/lib/league"

interface EmptyBoardProps {
  ready: boolean
}

export function EmptyBoard({ ready }: EmptyBoardProps) {
  const copy = emptyBoardCopy(ready)
  return (
    <div className="panel border-dashed p-12 text-center">
      <p className="text-lg text-muted-foreground">{copy.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy.detail}</p>
    </div>
  )
}
