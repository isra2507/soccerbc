import { expect, test } from '@playwright/test'
import { STAFF, addPlayers, getState, loginAsStaff, resetBoard } from './helpers.ts'

const team = (page: import('@playwright/test').Page, color: 'none' | 'blue' | 'red' | 'yellow') =>
  page.locator(`.team-table[data-team-color="${color}"]`)

test.describe('players', () => {
  test('sign-up is closed until staff set a date, then adds the player to a team', async ({ page }) => {
    await resetBoard({ open: false })
    await page.goto('/')

    await expect(page.locator('.signup-panel').getByText('Registration opens after staff sets the next soccer date.').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Date needed first' })).toBeDisabled()

    await resetBoard({ open: true })
    await page.reload()

    const form = page.locator('.signup-panel')
    await form.getByPlaceholder('First name').fill('Ann')
    await form.getByPlaceholder('Last name').fill('Lee')
    await form.locator('select').selectOption('professional')
    await form.getByRole('button', { name: 'Submit' }).click()

    await expect(form.locator('.form-notice')).toContainText('You were added')
    await expect(team(page, 'none')).toContainText('Ann Lee')
    await expect(team(page, 'none')).toContainText('Captain: Ann Lee')
  })

  test('shows the server message for a duplicate name', async ({ page }) => {
    await resetBoard({ open: true })
    await addPlayers([['Ann', 'beginner']])
    await page.goto('/')

    const form = page.locator('.signup-panel')
    await form.getByPlaceholder('First name').fill('ann')
    await form.getByPlaceholder('Last name').fill('TEST')
    await form.locator('select').selectOption('beginner')
    await form.getByRole('button', { name: 'Submit' }).click()

    await expect(form.locator('.form-notice')).toContainText('That name is already on the list.')
  })
})

test.describe('staff login', () => {
  test('rejects a wrong password, accepts the right one, and logs out', async ({ page }) => {
    await page.goto('/#/staff')
    await page.getByPlaceholder('First name').fill(STAFF.firstName)
    await page.getByPlaceholder('Last name').fill(STAFF.lastName)
    await page.getByPlaceholder('Staff password').fill('not the password')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.locator('.form-notice.error')).toHaveText('Wrong staff password.')

    await loginAsStaff(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })

  test('asks for everything before sending anything', async ({ page }) => {
    await page.goto('/#/staff')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.locator('.form-notice.error')).toContainText('Enter your first name, last name')
  })
})

test.describe('staff roster', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard({ open: true })
    await addPlayers([
      ['Ann', 'professional'],
      ['Bob', 'beginner'],
      ['Cy', 'intermediate'],
      ['Dee', 'semi-pro'],
    ])
    await loginAsStaff(page)
  })

  test('moves a player to another team and pins them there', async ({ page }) => {
    const row = team(page, 'none').locator('tbody tr').first()
    const name = (await row.locator('input[aria-label="First name"]').inputValue()) + ' Test'

    await row.getByLabel(/^Move .* to team$/).selectOption({ label: 'Team 2 (blue pinnie)' })

    await expect(page.locator('.admin-notice')).toHaveText('Roster updated.')
    await expect(team(page, 'blue').locator(`input[value="${name.split(' ')[0]}"]`)).toBeVisible()
    const moved = (await getState()).players.find((p: { firstName: string }) => p.firstName === name.split(' ')[0])
    expect(moved).toMatchObject({ team: 'team2', manualTeam: true })
  })

  test('renames when you leave the box, and Escape cancels', async ({ page }) => {
    const input = team(page, 'none').locator('tbody tr').first().locator('input[aria-label="First name"]')
    const original = await input.inputValue()

    await input.fill('Changed')
    await input.press('Escape')
    await expect(input).toHaveValue(original)

    await input.fill('Renamed')
    await input.press('Enter')
    await expect(page.locator('.admin-notice')).toHaveText('Roster updated.')
    await expect(page.locator('input[value="Renamed"]')).toBeVisible()
    expect((await getState()).players.map((p: { firstName: string }) => p.firstName)).toContain('Renamed')
  })

  test('changes a skill level and removes a player after confirming', async ({ page }) => {
    const row = team(page, 'none').locator('tbody tr').first()
    await row.getByLabel('Skill level').selectOption('professional')
    await expect(page.locator('.admin-notice')).toHaveText('Roster updated.')

    page.once('dialog', (dialog) => void dialog.dismiss())
    await row.getByRole('button', { name: 'Remove' }).click()
    expect((await getState()).players).toHaveLength(4)

    page.once('dialog', (dialog) => void dialog.accept())
    await row.getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.admin-notice')).toContainText('was removed.')
    await expect.poll(async () => (await getState()).players.length).toBe(3)
  })

  test('chooses a captain, which the public board shows', async ({ page }) => {
    const blue = team(page, 'blue')
    const options = blue.locator('.captain-select select option')
    const second = await options.nth(2).textContent()
    await blue.locator('.captain-select select').selectOption({ index: 2 })

    await expect(page.locator('.admin-notice')).toHaveText('Captain updated.')

    await page.getByRole('button', { name: 'Back to public board' }).click()
    await expect(team(page, 'blue').locator('.captain-line')).toContainText(second!.trim())
  })

  test('rebalances and switches the number of teams', async ({ page }) => {
    await page.getByRole('button', { name: 'Rebalance teams' }).click()
    await expect(page.locator('.admin-notice')).toContainText('rebalanced')

    await page.getByRole('button', { name: '3', exact: true }).click()
    await expect(page.locator('.admin-notice')).toContainText('3 balanced teams')
    await expect(page.locator('.team-table')).toHaveCount(3)

    await page.getByRole('button', { name: '2', exact: true }).click()
    await expect(page.locator('.team-table')).toHaveCount(2)
  })
})

test.describe('announcements', () => {
  test('publishes to the public board and can be removed', async ({ page }) => {
    await resetBoard({ open: true })
    await loginAsStaff(page)

    await page.locator('#match-announcement').fill('Bring water!')
    await page.getByRole('button', { name: 'Save announcement' }).click()
    await expect(page.locator('.admin-notice')).toHaveText('Announcement published.')

    await page.getByRole('button', { name: 'Back to public board' }).click()
    await expect(page.locator('.game-notice')).toContainText('Bring water!')

    await page.goto('/#/staff')
    await page.getByRole('button', { name: 'Remove announcement' }).click()
    await expect(page.locator('.admin-notice')).toHaveText('Announcement removed.')
    await expect(page.locator('.game-notice')).toHaveCount(0)
  })

  test('cannot be published without a date', async ({ page }) => {
    await resetBoard({ open: false })
    await loginAsStaff(page)

    await expect(page.getByRole('button', { name: 'Save announcement' })).toBeDisabled()
  })
})

test.describe('game date', () => {
  // The visitor's device is in Tokyo; the club is in Bellevue, and the page must say so.
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('is entered and shown in Pacific time whatever the device time zone', async ({ page }) => {
    await resetBoard({ open: false })
    await loginAsStaff(page)

    await page.locator('input[type="datetime-local"]').fill('2030-10-18T11:00')
    await page.getByRole('button', { name: 'Save date' }).click()

    await expect(page.locator('.admin-notice')).toContainText('Soccer date updated')
    await expect(page.locator('.announcement-editor')).toContainText(/Friday, October 18.*11:00\s?AM PDT/)
    await expect(page.locator('input[type="datetime-local"]')).toHaveValue('2030-10-18T11:00')
    expect((await getState()).match.nextMatchAt).toBe('2030-10-18T18:00:00.000Z')

    await page.getByRole('button', { name: 'Back to public board' }).click()
    await expect(page.locator('.match-strip')).toContainText(/Friday, October 18.*11:00\s?AM PDT/)
  })

  test('rejects a date that has already passed with the server message', async ({ page }) => {
    await resetBoard({ open: false })
    await loginAsStaff(page)

    await page.locator('input[type="datetime-local"]').fill('2020-01-10T11:00')
    await page.getByRole('button', { name: 'Save date' }).click()

    await expect(page.locator('.admin-notice')).toContainText('already passed')
  })
})

test('dark mode is remembered', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('button', { name: /Dark mode/ }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/dark-mode/)

  await page.reload()
  await expect(page.locator('.app-shell')).toHaveClass(/dark-mode/)
})
