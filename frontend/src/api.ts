import type { Summary, Violation, ChartSpec } from './types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export function fetchSummary(): Promise<Summary> {
  return request<Summary>('/summary')
}

export async function fetchViolations(): Promise<Violation[]> {
  const data = await request<{ violations: Violation[] }>('/violations')
  return data.violations
}

export function resolveViolation(
  id: number,
  status: 'resolved' | 'dismissed',
  note?: string,
): Promise<{ ok: boolean }> {
  return request(`/violations/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })
}

export function sendMessage(
  sessionId: string,
  message: string,
): Promise<{ text: string; chart?: ChartSpec }> {
  return request('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
}

export function clearSession(sessionId: string): Promise<{ ok: boolean }> {
  return request(`/chat/${sessionId}`, { method: 'DELETE' })
}
