import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, Send, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sendMessage, clearSession } from '../../api'
import Chart from '../Chart'
import type { ChatMessage } from '../../types'
import styles from './Agent.module.css'

const SUGGESTIONS = [
  'What did Fleet spend on fuel last quarter?',
  'Show me the top 5 employees by total spend',
  'Which violations are most urgent this month?',
  'Summarize spending by department for Q4 2025',
]

export default function Agent() {
  const sessionId     = useRef(crypto.randomUUID()).current
  const prefersReduced = useReducedMotion()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)
  const messagesRef             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const behavior = (messages.length > 1 && !prefersReduced) ? 'smooth' : 'instant'
    bottomRef.current?.scrollIntoView({ behavior })
  }, [messages, loading, prefersReduced])

  async function handleSend(content: string) {
    const trimmed = content.trim()
    if (!trimmed || loading) return

    setMessages((prev: ChatMessage[]) => [...prev, { id: crypto.randomUUID(), role: 'user', text: trimmed }])
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)

    try {
      const res = await sendMessage(sessionId, trimmed)
      setMessages((prev: ChatMessage[]) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: res.text, chart: res.chart },
      ])
    } catch {
      setMessages((prev: ChatMessage[]) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: 'Something went wrong — please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(text)
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }

  async function handleClear() {
    clearSession(sessionId).catch(() => {})
    setMessages([])
    textareaRef.current?.focus()
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <div className={styles.root}>

      {/* ── Header ──────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.botMark} aria-hidden>
            <Bot size={14} />
          </div>
          <span className={styles.headerTitle}>Finance Assistant</span>
          <span className={styles.headerSub}>Powered by Claude</span>
        </div>
        <AnimatePresence>
          {messages.length > 0 && (
            <motion.button
              className="btn-ghost"
              onClick={handleClear}
              aria-label="Clear conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReduced ? 0 : 0.15 }}
            >
              <Trash2 size={14} />
              Clear
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Messages ────────────────────────────── */}
      <div className={styles.messages} ref={messagesRef} aria-live="polite" aria-atomic="false">
        <div className={styles.spacer} />

        {/* Empty state */}
        {isEmpty && (
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0, y: prefersReduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReduced ? 0.15 : 0.3, ease: [0.25, 1, 0.5, 1] }}
          >
            <div className={styles.emptyIcon} aria-hidden>
              <Bot size={26} />
            </div>
            <p className={styles.emptyTitle}>
              Ask me anything about company card spending.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className={styles.suggestion}
                  onClick={() => handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Message list */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div
              className={`${styles.bubble} ${styles.bubbleAssistant}`}
              initial={{ opacity: 0, y: prefersReduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.avatar} aria-hidden><Bot size={12} /></div>
              <div className={styles.bubbleBody}>
                <span className="typing-dots" aria-label="Assistant is thinking">
                  <span /><span /><span />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ───────────────────────────── */}
      <div className={styles.inputBar}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder="Ask about spending, violations, or employees…"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Message"
          disabled={loading}
        />
        <button
          className={styles.sendBtn}
          onClick={() => handleSend(text)}
          disabled={!text.trim() || loading}
          aria-label="Send"
        >
          <Send size={15} />
        </button>
      </div>

    </div>
  )
}

/* ── MessageBubble ──────────────────────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser         = message.role === 'user'
  const prefersReduced = useReducedMotion()

  return (
    <motion.div
      className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
      initial={{ opacity: 0, y: prefersReduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
    >
      {!isUser && (
        <div className={styles.avatar} aria-hidden>
          <Bot size={12} />
        </div>
      )}

      <div className={`${styles.bubbleBody} ${isUser ? styles.bodyUser : styles.bodyAssistant}`}>
        {message.text && (
          isUser ? (
            <p className={styles.bubbleText}>{message.text}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p({ children }) {
                  return <p className={styles.mdPara}>{children}</p>
                },
                table({ children }) {
                  return (
                    <div className={styles.tableWrap}>
                      <table className={styles.mdTable}>{children}</table>
                    </div>
                  )
                },
                ul({ children }) {
                  return <ul className={styles.mdList}>{children}</ul>
                },
                ol({ children }) {
                  return <ol className={`${styles.mdList} ${styles.mdListOrdered}`}>{children}</ol>
                },
                li({ children }) {
                  return <li className={styles.mdListItem}>{children}</li>
                },
                code({ children }) {
                  return <code className={styles.mdCode}>{children}</code>
                },
                pre({ children }) {
                  return <pre className={styles.mdPre}>{children}</pre>
                },
                a({ href, children }) {
                  return <a href={href} className={styles.mdLink} target="_blank" rel="noopener noreferrer">{children}</a>
                },
                h2({ children }) {
                  return <h2 className={styles.mdH2}>{children}</h2>
                },
                h3({ children }) {
                  return <h3 className={styles.mdH3}>{children}</h3>
                },
              }}
            >
              {message.text}
            </ReactMarkdown>
          )
        )}
        {message.chart && (
          <div className={styles.chartWrap}>
            <Chart spec={message.chart} height={220} />
          </div>
        )}
      </div>
    </motion.div>
  )
}
