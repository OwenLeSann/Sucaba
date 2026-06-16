import { BarChart2, AlertTriangle, Bot } from 'lucide-react'
import type { Tab } from '../App'
import styles from './TabBar.module.css'

const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
  { id: 'overview',   label: 'Overview',        icon: <BarChart2 size={15} /> },
  { id: 'violations', label: 'Violations',       icon: <AlertTriangle size={15} /> },
  { id: 'agent',      label: 'Ask the Agent',    icon: <Bot size={15} /> },
]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
  violationCount?: number
}

export default function TabBar({ active, onChange, violationCount }: Props) {
  return (
    <nav className={styles.bar} role="tablist" aria-label="Dashboard sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          className={`${styles.tab} ${active === t.id ? styles.active : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
          {t.id === 'violations' && violationCount != null && violationCount > 0 && (
            <span className={styles.badge}>{violationCount}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
