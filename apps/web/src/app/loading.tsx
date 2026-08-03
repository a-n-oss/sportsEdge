export default function Loading() {
  return (
    <div className="space-y-8 animate-featured-in">
      <div className="space-y-3">
        <div className="h-3 w-28 skeleton rounded" />
        <div className="h-10 w-72 skeleton rounded" />
        <div className="h-4 w-96 max-w-full skeleton rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="panel p-8 space-y-6">
          <div className="h-6 w-48 skeleton rounded" />
          <div className="flex justify-between gap-8">
            <div className="h-20 w-20 skeleton rounded-xl" />
            <div className="h-20 w-20 skeleton rounded-xl" />
          </div>
          <div className="h-3 w-full skeleton rounded-full" />
        </div>
        <div className="rail-panel p-4 space-y-3">
          <div className="h-4 w-24 skeleton rounded" />
          <div className="h-12 w-full skeleton rounded" />
          <div className="h-12 w-full skeleton rounded" />
          <div className="h-12 w-full skeleton rounded" />
        </div>
      </div>
      <p className="text-center text-xs font-display uppercase tracking-wider text-muted-foreground">
        Crunching the numbers…
      </p>
    </div>
  )
}
