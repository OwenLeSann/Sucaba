import { useState, useEffect, lazy, Suspense } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { fetchViolations } from './api'
import TopNav from './components/TopNav'
import TabBar from './components/TabBar'
import Overview from './components/tabs/Overview'

const Violations = lazy(() => import('./components/tabs/Violations'))
const Agent      = lazy(() => import('./components/tabs/Agent'))

export type Tab = 'overview' | 'violations' | 'agent'

export default function App() {
  const [tab, setTab]                       = useState<Tab>('overview')
  const [violationCount, setViolationCount] = useState(0)
  const prefersReduced                      = useReducedMotion()

  useEffect(() => {
    fetchViolations()
      .then((vs) => setViolationCount(vs.length))
      .catch(() => {})
  }, [])

  const panel = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: prefersReduced ? 0 : 0.15, ease: 'easeOut' } },
    exit:    { opacity: 0, transition: { duration: prefersReduced ? 0 : 0.1,  ease: 'easeIn'  } },
  }

  return (
    <>
      <TopNav />
      <TabBar active={tab} onChange={setTab} violationCount={violationCount} />
      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Suspense fallback={<div style={panelStyle} />}>
          <AnimatePresence mode="wait">
            {tab === 'overview' && (
              <motion.div
                key="overview"
                {...panel}
                style={panelStyle}
                id="panel-overview"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="tab-overview"
              >
                <Overview onTabChange={(t) => setTab(t)} />
              </motion.div>
            )}
            {tab === 'violations' && (
              <motion.div
                key="violations"
                {...panel}
                style={panelStyle}
                id="panel-violations"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="tab-violations"
              >
                <Violations />
              </motion.div>
            )}
            {tab === 'agent' && (
              <motion.div
                key="agent"
                {...panel}
                style={{ ...panelStyle, overflow: 'hidden' }}
                id="panel-agent"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="tab-agent"
              >
                <Agent />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
      </main>
    </>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
}
