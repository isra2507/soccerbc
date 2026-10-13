import { useSyncExternalStore } from 'react'

export type StaffSession = {
  token: string
  /** "First Last", as signed into the token by the server. */
  name: string
}

const KEY = 'bcStaffSession'
const listeners = new Set<() => void>()

function read(): StaffSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<StaffSession>) : null
    return parsed && typeof parsed.token === 'string' && typeof parsed.name === 'string'
      ? { token: parsed.token, name: parsed.name }
      : null
  } catch {
    return null
  }
}

// useSyncExternalStore needs a snapshot that only changes identity when the data does.
let current: StaffSession | null = read()

function write(next: StaffSession | null) {
  current = next

  try {
    if (next) {
      window.sessionStorage.setItem(KEY, JSON.stringify(next))
    } else {
      window.sessionStorage.removeItem(KEY)
    }
  } catch {
    // Storage can be blocked; the session then just lasts until the page reloads.
  }

  listeners.forEach((listener) => listener())
}

/** The staff login, kept only for this browser tab (cleared when the tab closes). */
export const session = {
  get: () => current,
  getToken: () => current?.token ?? '',
  set: (next: StaffSession) => write(next),
  clear: () => write(null),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const useStaffSession = (): StaffSession | null =>
  useSyncExternalStore(session.subscribe, session.get)
