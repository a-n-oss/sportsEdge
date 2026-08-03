"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { RatingHistory } from "@/lib/api"
import { format, parseISO } from "date-fns"

interface Series {
  key: string
  label: string
  color: string
  data: RatingHistory[]
}

interface RatingChartProps {
  data?: RatingHistory[]
  series?: Series[]
}

export function RatingChart({ data, series }: RatingChartProps) {
  if (series && series.length > 0) {
    const dateMap = new Map<string, Record<string, string | number>>()
    for (const s of series) {
      for (const point of s.data) {
        const key = point.date
        const row = dateMap.get(key) ?? {
          date: key,
          formattedDate: format(parseISO(point.date), "MMM d"),
        }
        row[s.key] = Math.round(point.elo_rating)
        dateMap.set(key, row)
      }
    }
    const chartData = Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    )

    return (
      <div className="h-[320px] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="formattedDate" stroke="rgba(255,255,255,0.4)" fontSize={11} tickMargin={8} minTickGap={24} />
            <YAxis domain={["auto", "auto"]} stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#141416",
                borderColor: "#2a2a2e",
                color: "#f5f5f4",
                borderRadius: "6px",
              }}
            />
            <Legend />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: s.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const chartData = (data ?? []).map((item) => ({
    date: item.date,
    formattedDate: format(parseISO(item.date), "MMM d, yyyy"),
    rating: Math.round(item.elo_rating),
  }))

  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="formattedDate"
            stroke="rgba(255,255,255,0.4)"
            fontSize={12}
            tickMargin={10}
            minTickGap={30}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="rgba(255,255,255,0.4)"
            fontSize={12}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#141416",
              borderColor: "#2a2a2e",
              color: "#f5f5f4",
              borderRadius: "6px",
            }}
            itemStyle={{ color: "#c9a227" }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="#c9a227"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: "#c9a227" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
