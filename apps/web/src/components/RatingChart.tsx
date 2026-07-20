"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { RatingHistory } from "@/lib/api"
import { format, parseISO } from "date-fns"

interface RatingChartProps {
  data: RatingHistory[]
}

export function RatingChart({ data }: RatingChartProps) {
  // Process data for the chart
  const chartData = data.map(item => ({
    date: item.date,
    formattedDate: format(parseISO(item.date), "MMM d, yyyy"),
    rating: Math.round(item.elo_rating)
  }))

  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis 
            dataKey="formattedDate" 
            stroke="rgba(255,255,255,0.5)" 
            fontSize={12} 
            tickMargin={10} 
            minTickGap={30}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            stroke="rgba(255,255,255,0.5)" 
            fontSize={12} 
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fafafa', borderRadius: '8px' }}
            itemStyle={{ color: '#3b82f6' }}
          />
          <Line 
            type="monotone" 
            dataKey="rating" 
            stroke="#3b82f6" 
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
