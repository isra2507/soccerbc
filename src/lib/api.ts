import { createApiClient } from './client.ts'
import { session } from './session.ts'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

/** The API client the app uses, wired to the staff session. */
export const api = createApiClient({
  baseUrl,
  getToken: session.getToken,
  onUnauthorized: session.clear,
})
