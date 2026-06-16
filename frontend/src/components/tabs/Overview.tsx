import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { motion, useReducedMotion } from 'framer-motion'
import { fetchSummary, fetchViolations } from '../../api'
import type { Summary, Violation } from '../../types'
import styles from './Overview.module.css'

const RULE_LABELS: Record<string, string> = {
  missing_preauthorization: 'Pre-auth missing',
  possible_split_purchase:  'Split purchase',
  personal_expense_suspected: 'Personal expense',
  duplicate_charge:           'Duplicate charge',
}

// CSS custom properties can't be used in SVG presentation attributes (recharts Bar fill)
const ACCENT_COLOR = 'oklch(0.620 0.130 195)'

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
  labelStyle: { fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', fontSize: 11 },
}

interface Props {
  onTabChange?: (tab: 'violations') => void
}

export default function Overview({ onTabChange }: Props) {
  const prefersReduced  = useReducedMotion()
  const isFirstLoad     = useRef(true)
  const [summary, setSummary]           = useState<Summary | null>(null)
  const [violations, setViolations]     = useState<Violation[]>([])
  const [quarters, setQuarters]         = useState<string[]>([])
  const [quarter, setQuarter]           = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [error, setError]               = useState(false)
  const [barsReady, setBarsReady]       = useState(false)

  const listVariants = prefersReduced
    ? { hidden: {}, visible: {} }
    : { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }

  const itemVariants = prefersReduced
    ? { hidden: {}, visible: {} }
    : {
        hidden:  { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } },
      }

  // Violations load once — they're not quarter-scoped on the overview.
  useEffect(() => {
    fetchViolations()
      .then(setViolations)
      .catch(() => {})
  }, [])

  // Summary re-fetches whenever the selected quarter changes.
  useEffect(() => {
    if (isFirstLoad.current) {
      setLoading(true)
    } else {
      setBudgetLoading(true)
      setBarsReady(false)
    }
    isFirstLoad.current = false

    fetchSummary(quarter ?? undefined)
      .then((s) => {
        setSummary(s)
        setQuarters(s.quarters)
        setLoading(false)
        setBudgetLoading(false)
        requestAnimationFrame(() => requestAnimationFrame(() => setBarsReady(true)))
      })
      .catch(() => {
        setLoading(false)
        setBudgetLoading(false)
        setError(true)
      })
  }, [quarter])

  if (loading) return <Skeleton />
  if (error) return (
    <div className={styles.root}>
      <p className={styles.errorNote}>
        Unable to load dashboard data. Check the server connection and try refreshing.
      </p>
    </div>
  )
  if (!summary) return null

  const totalSpend = summary.monthly_spend.reduce((acc: number, m: { total: number }) => acc + m.total, 0)
  const recent     = violations.slice(0, 5)

  return (
    <div className={styles.root}>

      {/* ── Monthly spend chart ─────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Monthly Card Spend</h2>
          <span className={styles.sectionMeta}>
            <span className="mono">${Math.round(totalSpend).toLocaleString('en-CA')}</span>
            {' '}total · Aug 2025 – present
          </span>
        </div>
        <ResponsiveContainer width="100%" height={256}>
          <BarChart
            data={summary.monthly_spend.map((m) => ({
              month: m.month.replace(/^20/, "'"),
              spend: m.total,
            }))}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => '$' + Math.round(v / 1000) + 'k'}
              width={48}
            />
            <Tooltip
              formatter={(v: number) => ['$' + Math.round(v).toLocaleString('en-CA') + ' CAD', 'Spend']}
              {...tooltipStyle}
            />
            <Bar
              dataKey="spend"
              fill={ACCENT_COLOR}
              radius={[3, 3, 0, 0]}
              animationDuration={prefersReduced ? 0 : 700}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── Lower grid ─────────────────────────────────── */}
      <div className={styles.lower}>

        {/* Department budgets */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Department Budgets</h2>
            {quarters.length > 1 && (
              <div className={styles.quarterPills} role="group" aria-label="Select quarter">
                {quarters.map((q) => (
                  <button
                    key={q}
                    className={`${styles.quarterPill} ${(quarter ?? summary.current_quarter) === q ? styles.quarterPillActive : ''}`}
                    onClick={() => setQuarter(q)}
                    aria-pressed={(quarter ?? summary.current_quarter) === q}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {quarters.length === 1 && (
              <span className={styles.quarterBadge}>{summary.current_quarter}</span>
            )}
          </div>
          <div
            className={styles.budgets}
            style={{ opacity: budgetLoading ? 0.45 : 1, transition: 'opacity var(--dur-fast)' }}
          >
            {summary.budgets.map((b) => {
              const pct  = Math.min((b.spent / b.budget_cad) * 100, 100)
              const over = b.spent > b.budget_cad
              return (
                <div key={b.department} className={styles.budgetRow}>
                  <div className={styles.budgetRowHead}>
                    <span className={styles.deptName}>{b.department}</span>
                    <span className={styles.deptAmounts}>
                      <span className="mono">${Math.round(b.spent).toLocaleString()}</span>
                      <span className={styles.slash}> / </span>
                      <span className="mono" style={{ color: 'var(--color-muted)' }}>
                        ${Math.round(b.budget_cad).toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div
                      className={`${styles.fill} ${over ? styles.fillOver : ''}`}
                      style={{ transform: `scaleX(${barsReady ? pct / 100 : 0})` }}
                    />
                  </div>
                  {over && (
                    <p className={styles.overLabel}>
                      ${Math.round(Math.abs(b.remaining)).toLocaleString()} over budget
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Recent open violations */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Open Violations
            {violations.length > 0 && (
              <span className={styles.violCount}>{violations.length}</span>
            )}
          </h2>
          {recent.length === 0 ? (
            <p className={styles.emptyNote}>No open violations — looking clean.</p>
          ) : (
            <motion.ul
              className={styles.violList}
              initial="hidden"
              animate="visible"
              variants={listVariants}
            >
              {recent.map((v) => (
                <motion.li key={v.id} className={styles.violRow} variants={itemVariants}>
                  <span className={`sev-badge sev-${v.severity}`} aria-label={`Severity ${v.severity}`}>
                    {v.severity}
                  </span>
                  <div className={styles.violInfo}>
                    <span className={styles.violName}>{v.employee_name}</span>
                    <span className="rule-chip">{RULE_LABELS[v.rule] ?? v.rule}</span>
                  </div>
                  <span className={`mono ${styles.violAmount}`}>
                    ${Math.round(v.amount).toLocaleString()}
                  </span>
                </motion.li>
              ))}
              {violations.length > 5 && (
                <li className={styles.moreNote}>
                  {onTabChange ? (
                    <button
                      className={styles.moreLink}
                      onClick={() => onTabChange('violations')}
                    >
                      +{violations.length - 5} more — view all violations
                    </button>
                  ) : (
                    <>+{violations.length - 5} more — see Violations tab</>
                  )}
                </li>
              )}
            </motion.ul>
          )}
        </section>

      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className={styles.root}>
      <div className="skeleton" style={{ height: 300, borderRadius: 8 }} />
      <div className={styles.lower}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
