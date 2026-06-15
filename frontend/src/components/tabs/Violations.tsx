import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { CheckCircle, XCircle, ChevronDown } from 'lucide-react'
import { fetchViolations, resolveViolation } from '../../api'
import type { Violation } from '../../types'
import styles from './Violations.module.css'

const RULE_LABELS: Record<string, string> = {
  missing_preauthorization:   'Pre-auth missing',
  possible_split_purchase:    'Split purchase',
  personal_expense_suspected: 'Personal expense',
  duplicate_charge:           'Duplicate charge',
}

const FILTER_OPTIONS = [
  { value: 'all',                       label: 'All' },
  { value: 'missing_preauthorization',  label: 'Pre-auth missing' },
  { value: 'possible_split_purchase',   label: 'Split purchase' },
  { value: 'personal_expense_suspected',label: 'Personal expense' },
  { value: 'duplicate_charge',          label: 'Duplicate charge' },
]

type SortKey = 'severity' | 'amount' | 'employee' | 'date'

interface Resolving {
  id: number
  action: 'resolved' | 'dismissed'
}

export default function Violations() {
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all')
  const [sort, setSort]             = useState<SortKey>('severity')
  const [resolving, setResolving]   = useState<Resolving | null>(null)
  const [note, setNote]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const prefersReduced              = useReducedMotion()

  useEffect(() => {
    fetchViolations()
      .then(setViolations)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = violations.filter(
    (v) => filter === 'all' || v.rule === filter,
  )

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'severity': return b.severity - a.severity
      case 'amount':   return b.amount - a.amount
      case 'employee': return a.employee_name.localeCompare(b.employee_name)
      case 'date':     return (b.latest_txn_date ?? '').localeCompare(a.latest_txn_date ?? '')
      default:         return 0
    }
  })

  function startResolving(id: number, action: 'resolved' | 'dismissed') {
    if (resolving?.id === id && resolving.action === action) {
      setResolving(null)
      setNote('')
    } else {
      setResolving({ id, action })
      setNote('')
    }
  }

  async function confirmResolve() {
    if (!resolving) return
    setSubmitting(true)
    try {
      await resolveViolation(resolving.id, resolving.action, note || undefined)
      setViolations((prev) => prev.filter((v) => v.id !== resolving.id))
      setResolving(null)
      setNote('')
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const listVariants: Variants = prefersReduced
    ? { visible: {} }
    : { visible: { transition: { staggerChildren: 0.035 } } }

  const itemVariants: Variants = prefersReduced
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden:  { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } },
      }

  if (loading) return <Skeleton />

  return (
    <div className={styles.root}>
      {/* ── Toolbar ──────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Filter by rule">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`${styles.filterPill} ${filter === o.value ? styles.filterActive : ''}`}
              onClick={() => setFilter(o.value)}
              aria-pressed={filter === o.value}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className={styles.sortWrap}>
          <span className={styles.sortLabel}>Sort</span>
          <div className={styles.selectWrap}>
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort violations"
            >
              <option value="severity">Severity</option>
              <option value="amount">Amount</option>
              <option value="employee">Employee</option>
              <option value="date">Date</option>
            </select>
            <ChevronDown size={13} className={styles.selectChevron} aria-hidden />
          </div>
        </label>
      </div>

      {/* ── Count ────────────────────────────────── */}
      <p className={styles.count}>
        {sorted.length === 0
          ? 'No violations match'
          : `${sorted.length} open violation${sorted.length !== 1 ? 's' : ''}`}
      </p>

      {/* ── List ─────────────────────────────────── */}
      {sorted.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <motion.ul
          className={styles.list}
          initial="hidden"
          animate="visible"
          variants={listVariants}
          aria-label="Open violations"
        >
          <AnimatePresence>
            {sorted.map((v) => (
              <ViolationRow
                key={v.id}
                violation={v}
                isExpanded={resolving?.id === v.id}
                expandedAction={resolving?.action}
                note={note}
                submitting={submitting}
                onNote={setNote}
                onResolve={() => startResolving(v.id, 'resolved')}
                onDismiss={() => startResolving(v.id, 'dismissed')}
                onConfirm={confirmResolve}
                onCancel={() => { setResolving(null); setNote('') }}
                itemVariants={itemVariants}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  )
}

/* ── ViolationRow ─────────────────────────────────── */

interface RowProps {
  violation:      Violation
  isExpanded:     boolean
  expandedAction: 'resolved' | 'dismissed' | undefined
  note:           string
  submitting:     boolean
  onNote:         (s: string) => void
  onResolve:      () => void
  onDismiss:      () => void
  onConfirm:      () => void
  onCancel:       () => void
  itemVariants:   Variants
}

function ViolationRow({
  violation: v, isExpanded, expandedAction,
  note, submitting, onNote, onResolve, onDismiss, onConfirm, onCancel,
  itemVariants,
}: RowProps) {
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isExpanded) noteRef.current?.focus()
  }, [isExpanded])

  const dateStr = v.latest_txn_date
    ? new Date(v.latest_txn_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <motion.li
      className={styles.row}
      variants={itemVariants}
      layout
    >
      {/* ── Main row ── */}
      <div className={styles.rowMain}>
        <span className={`sev-badge sev-${v.severity}`} aria-label={`Severity ${v.severity}`}>
          {v.severity}
        </span>

        <div className={styles.rowInfo}>
          <div className={styles.rowTop}>
            <span className={styles.employeeName}>{v.employee_name}</span>
            <span className="rule-chip">{RULE_LABELS[v.rule] ?? v.rule}</span>
          </div>
          <p className={styles.detail}>{v.detail}</p>
        </div>

        <div className={styles.rowMeta}>
          <span className={`mono ${styles.amount}`}>
            ${Math.round(v.amount).toLocaleString('en-CA')}
          </span>
          <span className={`mono ${styles.date}`}>{dateStr}</span>
        </div>

        <div className={styles.rowActions}>
          <button
            className={`btn-ghost ${isExpanded && expandedAction === 'resolved' ? styles.actionActive : ''}`}
            onClick={onResolve}
            aria-expanded={isExpanded && expandedAction === 'resolved'}
            aria-label={`Resolve violation for ${v.employee_name}`}
          >
            <CheckCircle size={14} />
            Resolve
          </button>
          <button
            className={`btn-ghost ${isExpanded && expandedAction === 'dismissed' ? styles.actionActive : ''}`}
            onClick={onDismiss}
            aria-expanded={isExpanded && expandedAction === 'dismissed'}
            aria-label={`Dismiss violation for ${v.employee_name}`}
          >
            <XCircle size={14} />
            Dismiss
          </button>
        </div>
      </div>

      {/* ── Inline resolution panel ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className={styles.resolvePanel}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.resolvePanelInner}>
              <textarea
                ref={noteRef}
                className={styles.noteInput}
                placeholder={`Add a note for this ${expandedAction === 'dismissed' ? 'dismissal' : 'resolution'} (optional)`}
                value={note}
                onChange={(e) => onNote(e.target.value)}
                rows={2}
                aria-label="Resolution note"
              />
              <div className={styles.resolveActions}>
                <button className="btn-ghost" onClick={onCancel} disabled={submitting}>
                  Cancel
                </button>
                <button
                  className={expandedAction === 'dismissed' ? 'btn-ghost' : 'btn-primary'}
                  onClick={onConfirm}
                  disabled={submitting}
                  aria-label={`Confirm ${expandedAction}`}
                >
                  {submitting
                    ? 'Saving…'
                    : expandedAction === 'resolved'
                    ? 'Confirm resolve'
                    : 'Confirm dismiss'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/* ── Empty state ──────────────────────────────────── */
function EmptyState({ filter }: { filter: string }) {
  if (filter !== 'all') {
    return (
      <div className="empty-state">
        <p>No open violations in this category.</p>
      </div>
    )
  }
  return (
    <div className="empty-state">
      <CheckCircle size={40} strokeWidth={1.5} />
      <p>No open violations — the books are clean.</p>
    </div>
  )
}

/* ── Skeleton ─────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div className="skeleton" style={{ height: 44, width: '60%', borderRadius: 8 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 72 }} />
      ))}
    </div>
  )
}
