export default function GameDetailLoading() {
  return (
    <div className="space-y-8 animate-featured-in">
      <div className="space-y-3">
        <div className="h-3 w-28 skeleton rounded" />
        <div className="h-10 w-72 skeleton rounded" />
        <div className="h-4 w-96 max-w-full skeleton rounded" />
      </div>
      <div className="panel space-y-6 p-8">
        <div className="flex justify-between gap-8">
          <div className="h-20 w-20 skeleton rounded-xl" />
          <div className="h-20 w-20 skeleton rounded-xl" />
        </div>
        <div className="h-3 w-full skeleton rounded-full" />
      </div>
      <p className="text-center text-xs font-display uppercase tracking-wider text-muted-foreground">
        Crunching the numbers…
      </p>
    </div>
  )
}
