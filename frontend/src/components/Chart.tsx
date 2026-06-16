import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartSpec } from '../types'
import { CHART_COLORS as COLORS } from '../chartTheme'

const fmtCAD = (v: number) =>
  '$' + Math.round(v).toLocaleString('en-CA')

function pivot(spec: ChartSpec): Record<string, string | number>[] {
  const xs = [...new Set(spec.series.flatMap((s) => s.points.map((p) => p.x)))]
  return xs.map((x) => {
    const row: Record<string, string | number> = { x }
    spec.series.forEach((s) => {
      const pt = s.points.find((p) => p.x === x)
      row[s.name] = pt?.y ?? 0
    })
    return row
  })
}

const tickStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fill: 'var(--color-muted)',
}

const tooltipStyle = {
  contentStyle: {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    boxShadow: 'var(--shadow-float)',
    color: 'var(--color-ink)',
  },
  itemStyle: { color: 'var(--color-ink)' },
  labelStyle: { fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', fontSize: 11 },
}

interface Props {
  spec: ChartSpec
  height?: number
}

export default function Chart({ spec, height = 260 }: Props) {
  const data = pivot(spec)

  if (spec.type === 'pie') {
    const slices = spec.series[0]?.points.map((p) => ({ name: p.x, value: p.y })) ?? []
    return (
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-ink)', marginBottom: 8 }}>
          {spec.title}
        </figcaption>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={height / 2 - 20}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => fmtCAD(v)}
              {...tooltipStyle}
            />
            <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </figure>
    )
  }

  if (spec.type === 'table') {
    const cols = ['x', ...spec.series.map((s) => s.name)]
    return (
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-ink)', marginBottom: 8 }}>
          {spec.title}
        </figcaption>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-label)' }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-ink)' }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? 'var(--color-surface)' : 'transparent' }}>
                  {cols.map((c) => (
                    <td key={c} style={{ padding: '6px 12px', fontFamily: typeof row[c] === 'number' ? 'var(--font-mono)' : undefined, color: 'var(--color-ink)' }}>
                      {typeof row[c] === 'number' ? fmtCAD(row[c] as number) : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    )
  }

  if (spec.type === 'line') {
    return (
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-ink)', marginBottom: 8 }}>
          {spec.title}
        </figcaption>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="x" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtCAD} width={72} />
            <Tooltip formatter={(v: number) => fmtCAD(v)} {...tooltipStyle} />
            {spec.series.length > 1 && <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: 12 }} />}
            {spec.series.map((s, i) => (
              <Line
                key={s.name}
                dataKey={s.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                animationDuration={600}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </figure>
    )
  }

  // default: bar
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-ink)', marginBottom: 8 }}>
        {spec.title}
      </figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="x" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtCAD} width={72} />
          <Tooltip formatter={(v: number) => fmtCAD(v)} {...tooltipStyle} />
          {spec.series.length > 1 && <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: 12 }} />}
          {spec.series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={COLORS[i % COLORS.length]}
              radius={[3, 3, 0, 0]}
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
