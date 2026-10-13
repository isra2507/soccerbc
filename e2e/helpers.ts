import { expect, type Page } from '@playwright/test'

const API = 'http://localhost:3001'
export const STAFF = { firstName: 'Sam', lastName: 'Coach', password: 'dev' }

async function call(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${payload.message}`)
  }

  return payload
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/** Puts the shared board back to a known state: empty, two teams, open or closed. */
export async function resetBoard({ open }: { open: boolean }) {
  const { token } = await call('POST', '/auth', STAFF)
  await call('PUT', '/match', { nextMatchAt: null, teamCount: 2 }, token)

  if (open) {
    await call('PUT', '/match', { nextMatchAt: inDays(3) }, token)
  }

  return token as string
}

export const addPlayers = async (players: [firstName: string, skill: string][]) => {
  for (const [firstName, skill] of players) {
    await call('POST', '/players', { firstName, lastName: 'Test', skill })
  }
}

export const getState = () => call('GET', '/state')

export async function loginAsStaff(page: Page) {
  await page.goto('/#/staff')
  await page.getByPlaceholder('First name').fill(STAFF.firstName)
  await page.getByPlaceholder('Last name').fill(STAFF.lastName)
  await page.getByPlaceholder('Staff password').fill(STAFF.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByText(`Logged in as ${STAFF.firstName} ${STAFF.lastName}`)).toBeVisible()
}
