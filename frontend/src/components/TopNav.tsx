import styles from './TopNav.module.css'

function AbacusMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg
        viewBox="0 0 24 18"
        width="18"
        height="14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rails */}
        <line x1="1" y1="4"  x2="23" y2="4"  stroke="white" strokeWidth="0.7" strokeOpacity="0.35" />
        <line x1="1" y1="9"  x2="23" y2="9"  stroke="white" strokeWidth="0.7" strokeOpacity="0.35" />
        <line x1="1" y1="14" x2="23" y2="14" stroke="white" strokeWidth="0.7" strokeOpacity="0.35" />
        {/* Centre divider */}
        <line x1="11.5" y1="1" x2="11.5" y2="17" stroke="white" strokeWidth="0.7" strokeOpacity="0.3" />
        {/* Row 1 — 2 left, 1 right */}
        <circle cx="3.5"  cy="4"  r="2.1" fill="white" />
        <circle cx="7.5"  cy="4"  r="2.1" fill="white" />
        <circle cx="19.5" cy="4"  r="2.1" fill="white" />
        {/* Row 2 — 1 left, 2 right */}
        <circle cx="3.5"  cy="9"  r="2.1" fill="white" />
        <circle cx="15.5" cy="9"  r="2.1" fill="white" />
        <circle cx="19.5" cy="9"  r="2.1" fill="white" />
        {/* Row 3 — 2 left, 1 right */}
        <circle cx="3.5"  cy="14" r="2.1" fill="white" />
        <circle cx="7.5"  cy="14" r="2.1" fill="white" />
        <circle cx="19.5" cy="14" r="2.1" fill="white" />
      </svg>
    </span>
  )
}

export default function TopNav() {
  return (
    <header className={styles.nav} role="banner">
      <div className={styles.left}>
        <AbacusMark />
        <div className={styles.wordmarkGroup}>
          <span className={styles.wordmark}>Sucaba</span>
          <span className={styles.wordmarkSub}>Expense Intelligence</span>
        </div>
      </div>
      <div className={styles.right}>
        <span className={styles.role}>Finance Manager</span>
        <span className={styles.avatar} aria-label="User account">FM</span>
      </div>
    </header>
  )
}
