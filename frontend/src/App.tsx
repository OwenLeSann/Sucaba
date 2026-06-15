import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TopNav from './components/TopNav'
import TabBar from './components/TabBar'
import Overview from './components/tabs/Overview'
import Violations from './components/tabs/Violations'
import Agent from './components/tabs/Agent'

export type Tab = 'overview' | 'violations' | 'agent'

const panel = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <>
      <TopNav />
      <TabBar active={tab} onChange={setTab} />
      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait">
          {tab === 'overview' && (
            <motion.div key="overview" {...panel} style={panelStyle}>
              <Overview />
            </motion.div>
          )}
          {tab === 'violations' && (
            <motion.div key="violations" {...panel} style={panelStyle}>
              <Violations />
            </motion.div>
          )}
          {tab === 'agent' && (
            <motion.div key="agent" {...panel} style={{ ...panelStyle, overflow: 'hidden' }}>
              <Agent />
            </motion.div>
          )}
        </AnimatePresence>
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
