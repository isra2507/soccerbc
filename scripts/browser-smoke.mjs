import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.SOCCER_TEST_URL || 'http://127.0.0.1:4173'
const chromePaths = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

async function firstWorkingExecutable(paths) {
  const { access } = await import('node:fs/promises')

  for (const path of paths) {
    try {
      await access(path)
      return path
    } catch {
      // Try the next common browser path.
    }
  }

  throw new Error('Chrome or Edge was not found. Set CHROME_PATH and try again.')
}

async function waitFor(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(message)
}

await waitFor(async () => {
  try {
    return (await fetch(appUrl)).ok
  } catch {
    return false
  }
}, `The dev server is not responding at ${appUrl}.`)

const browserPath = await firstWorkingExecutable(chromePaths)
const profileDirectory = await mkdtemp(join(tmpdir(), 'soccer-browser-'))
const screenshotDirectory = await mkdtemp(join(tmpdir(), 'soccer-screenshots-'))
const debuggingPort = 9300 + Math.floor(Math.random() * 500)
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let socket
let commandId = 0
const pendingCommands = new Map()

try {
  let target
  await waitFor(async () => {
    try {
      const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
        .then((response) => response.json())
      target = targets.find((item) => item.type === 'page')
      return Boolean(target?.webSocketDebuggerUrl)
    } catch {
      return false
    }
  }, 'Chrome did not open its debugging connection.')

  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const pending = pendingCommands.get(message.id)

    if (!pending) {
      return
    }

    pendingCommands.delete(message.id)
    if (message.error) {
      pending.reject(new Error(message.error.message))
    } else {
      pending.resolve(message.result)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      commandId += 1
      pendingCommands.set(commandId, { resolve, reject })
      socket.send(JSON.stringify({ id: commandId, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text)
    }

    return result.result.value
  }

  const waitForExpression = (expression, message) =>
    waitFor(() => evaluate(expression), message)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: appUrl })
  await waitForExpression(
    "document.querySelector('.signup-panel') !== null",
    'The public signup page did not render.',
  )

  const players = Array.from({ length: 12 }, (_, index) => ({
    id: `smoke-${index + 1}`,
    firstName: `Player${index + 1}`,
    lastName: 'Smoke',
    skill: ['professional', 'semi-pro', 'intermediate', 'beginner'][index % 4],
    team: 'penny',
    joinedAt: new Date(2026, 0, index + 1).toISOString(),
  }))
  const state = {
    players,
    match: {
      teamCount: 2,
      nextMatchAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: '',
      updatedBy: '',
      pastGames: [],
      captains: {},
    },
  }

  await evaluate(`
    localStorage.setItem('bc-soccer-live-board', ${JSON.stringify(JSON.stringify(state))});
    sessionStorage.setItem('bcStaffToken', 'browser-smoke-token');
    sessionStorage.setItem('bcStaffName', JSON.stringify({ firstName: 'Browser', lastName: 'Test' }));
    location.hash = '/staff';
    location.reload();
  `)
  await waitForExpression(
    "document.querySelector('.member-dashboard-page') !== null && document.body.textContent.includes('Player1 Smoke')",
    'The staff dashboard did not finish loading the roster.',
  )
  assert.equal(await evaluate("document.querySelectorAll('.team-table').length"), 2)

  await evaluate(`
    [...document.querySelectorAll('.team-count-button')]
      .find((button) => button.textContent.trim() === '4')
      .click()
  `)
  await waitForExpression(
    "document.querySelector('.admin-notice')?.textContent.includes('4 balanced teams')",
    'Changing to four teams did not finish.',
  )
  await waitForExpression(
    "document.querySelectorAll('.team-table').length === 4",
    'The staff dashboard did not display all four teams.',
  )

  assert.deepEqual(await evaluate("[...document.querySelectorAll('.team-table')].map(t => t.dataset.teamColor)"), ['none', 'blue', 'red', 'yellow'])
  await evaluate(`
    const move = document.querySelector('select[aria-label^="Move "]');
    move.value = 'team4';
    move.dispatchEvent(new Event('change', { bubbles: true }));
  `)
  await waitForExpression("document.querySelector('.team-table[data-team-color=yellow]').textContent.includes('Player1')", 'Manual move did not update the draft.')
  await evaluate("document.querySelector('section.roster-actions .submit-button').click()")
  await waitForExpression("JSON.parse(localStorage.getItem('bc-soccer-live-board')).players.find(p => p.id === 'smoke-1').team === 'team4'", 'Manual move did not persist.')
  await evaluate("[...document.querySelectorAll('section.roster-actions button')].find(b => b.textContent.trim() === 'Rebalance teams').click()")
  await evaluate("document.querySelector('section.roster-actions .submit-button').click()")
  await waitForExpression("JSON.parse(localStorage.getItem('bc-soccer-live-board')).players.every(p => !p.manualTeam)", 'Rebalance did not clear manual assignments.')

  const fourTeamState = await evaluate(
    "JSON.parse(localStorage.getItem('bc-soccer-live-board'))",
  )
  assert.equal(fourTeamState.players.length, players.length)
  assert.equal(fourTeamState.match.teamCount, 4)

  await evaluate(`
    const input = document.querySelector('input[aria-label="First name"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Updated');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `)
  await waitForExpression(
    "document.querySelector('section.roster-actions .submit-button')?.disabled === false",
    'The edited player did not mark the roster as changed.',
  )
  await evaluate("document.querySelector('section.roster-actions .submit-button').click()")
  await waitForExpression(
    "document.querySelector('.admin-notice')?.textContent.includes('Roster updated')",
    'The edited player was not saved.',
  )

  for (const message of ['Bring water for Friday.', 'Kickoff reminder: arrive early.']) {
    await evaluate(`
      var announcementField = document.querySelector('#match-announcement');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(announcementField, ${JSON.stringify(message)});
      announcementField.dispatchEvent(new Event('input', { bubbles: true }));
    `)
    await evaluate("document.querySelector('.announcement-editor').requestSubmit()")
    await waitForExpression(`JSON.parse(localStorage.getItem('bc-soccer-live-board')).match.announcement === ${JSON.stringify(message)}`, 'Announcement did not save.')
    await waitForExpression(`document.querySelector('.game-notice')?.textContent.includes(${JSON.stringify(message)})`, 'Saved announcement did not appear.')
  }
  await evaluate("[...document.querySelectorAll('.announcement-editor button')].find(b => b.textContent === 'Remove announcement').click()")
  await waitForExpression("!document.querySelector('.game-notice') && JSON.parse(localStorage.getItem('bc-soccer-live-board')).match.announcement === ''", 'Announcement did not remove.')
  await evaluate(`
    var announcementField = document.querySelector('#match-announcement');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(announcementField, 'Bring water for Friday.');
    announcementField.dispatchEvent(new Event('input', { bubbles: true }));
  `)
  await evaluate("document.querySelector('.announcement-editor').requestSubmit()")
  await waitForExpression("JSON.parse(localStorage.getItem('bc-soccer-live-board')).match.announcement === 'Bring water for Friday.'", 'Public announcement did not save.')

  await send('Page.navigate', { url: `${appUrl}/#/` })
  await waitForExpression(
    "document.querySelector('.signup-panel') !== null",
    'The public page did not reopen.',
  )
  assert.equal(await evaluate("document.querySelectorAll('.team-table').length"), 4)
  assert.ok(await evaluate("document.querySelector('.game-notice').textContent.includes('Bring water for Friday.')"))
  assert.equal(await evaluate("document.querySelector('.discord-invite a').href"), 'https://discord.gg/NeyphJrqW')
  assert.ok(await evaluate("document.querySelector('.discord-invite img').naturalWidth > 0"))
  assert.equal(await evaluate("document.querySelectorAll('.club-contact a[href^=\"mailto:\"]').length"), 2)

  await evaluate(`
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const fields = document.querySelectorAll('.signup-panel input');
    setValue(fields[0], 'New');
    setValue(fields[1], 'Member');
    setValue(document.querySelector('.signup-panel select'), 'professional');
    document.querySelector('.signup-panel').requestSubmit();
  `)
  await waitForExpression(
    "document.querySelector('.signup-panel .form-notice')?.textContent.includes('You were added')",
    'A new public signup was not saved.',
  )

  const finalState = await evaluate(
    "JSON.parse(localStorage.getItem('bc-soccer-live-board'))",
  )
  const teamCounts = Object.values(
    finalState.players.reduce((counts, player) => {
      counts[player.team] = (counts[player.team] || 0) + 1
      return counts
    }, {}),
  )

  assert.equal(finalState.players.length, players.length + 1)
  assert.equal(new Set(finalState.players.map((player) => player.team)).size, 4)
  assert.ok(Math.max(...teamCounts) - Math.min(...teamCounts) <= 1)
  assert.equal(
    await evaluate("document.body.textContent.includes('New Member')"),
    true,
  )
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
    true,
  )

  const desktopScreenshot = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(screenshotDirectory, 'desktop.png'),
    Buffer.from(desktopScreenshot.data, 'base64'),
  )

  await evaluate("document.querySelector('.teams-panel').scrollIntoView({ block: 'start' })")
  await new Promise((resolve) => setTimeout(resolve, 300))
  const desktopTeamsScreenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(
    join(screenshotDirectory, 'desktop-teams.png'),
    Buffer.from(desktopTeamsScreenshot.data, 'base64'),
  )

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
    true,
  )
  const mobileScreenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(
    join(screenshotDirectory, 'mobile-teams.png'),
    Buffer.from(mobileScreenshot.data, 'base64'),
  )

  console.log(`Browser smoke test passed. Screenshots: ${screenshotDirectory}`)
  await send('Browser.close')
} finally {
  socket?.close()
  if (!browser.killed) {
    browser.kill()
  }
}
