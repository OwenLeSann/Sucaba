import styles from './TopNav.module.css'

export default function TopNav() {
  return (
    <header className={styles.nav} role="banner">
      <div className={styles.left}>
        <span className={styles.mark} aria-hidden="true">EI</span>
        <span className={styles.wordmark}>Expense Intelligence</span>
      </div>
      <div className={styles.right}>
        <span className={styles.role}>Finance Manager</span>
        <span className={styles.avatar} aria-label="User account">FM</span>
      </div>
    </header>
  )
}
