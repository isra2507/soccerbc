import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  addPlayer,
  loadState,
  replacePlayers,
  subscribeState,
  updateMatch,
} from './dataStore'

const STAFF_PASSWORD = 'Football11!'
const DARK_MODE_KEY = 'bcSoccerDarkMode'
const MENU_BALLS = Array.from({ length: 16 }, (_, index) => ({
  id: index,
  delay: `${(index % 8) * 0.42}s`,
  duration: `${4.8 + (index % 5) * 0.45}s`,
  left: `${5 + ((index * 23) % 88)}%`,
  size: `${18 + (index % 4) * 7}px`,
  spin: `${index % 2 === 0 ? 1 : -1}`,
}))

const SKILL_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner (first time touching grass)',
  },
  {
    value: 'intermediate',
    label: 'Intermediate (I somewhat know how to control and pass)',
  },
  {
    value: 'semi-pro',
    label: 'Semi-pro (I know ball)',
  },
  {
    value: 'professional',
    label: "Professional (Ball knows me)",
  },
]

const TEAM_LABELS = {
  penny: 'Team 1 (penny)',
  withoutPenny: 'Team 2 (without penny)',
}

const TEAM_KEYS = ['penny', 'withoutPenny']

const DATA_STATUS_LABELS = {
  cloud: 'Live online board',
  local: 'Local saved board',
  'missing-cloud': 'Shared database needed',
}

const ABOUT_MEMBERS = [
  {
    name: 'Rodrigo',
    role: 'Founder and President',
    story:
      'When Rodrigo first arrived from Mexico, one of the first things he did was head straight to the soccer field. Back home, soccer was woven into daily life. You did not need an official league or an intense tryout. You just showed up with a ball, and a game happened naturally. But when he got to the fields at Bellevue College, he was surprised to find that casual, drop-in pickup culture did not really exist on campus.',
    impact:
      'As president, Rodrigo oversees the big picture and keeps the club moving in the right direction. He coordinates meeting times, makes sure pickup sessions run smoothly and safely on the field, and focuses on keeping the club welcoming and inclusive for players of all skill levels. He likes to think of himself as the conductor of the orchestra.',
  },
  {
    name: 'Kc',
    role: 'Vice President',
    story:
      'Kc is Rodrigo\'s right hand in running the club. They work together on the day-to-day operations and logistics that keep the club organized.',
    impact:
      'Kc steps in to lead whenever Rodrigo is tied up and helps make sure everything runs efficiently behind the scenes.',
  },
  {
    name: 'Stacey',
    role: 'Treasurer',
    story:
      'Stacey manages the financial side of the club. She manages the budget, tracks expenses, and makes sure resources are used properly.',
    impact:
      'Whenever the club has an event and asks the school for funds, Stacey helps make sure everything makes sense.',
  },
  {
    name: 'Jonathan',
    role: 'Marketing',
    story:
      'Jonathan is the voice of the club on campus. He handles physical and digital outreach, designs flyers, and finds creative ways to get the club name out there.',
    impact:
      'His work helps make sure every Bellevue College student knows the club exists and feels invited to join.',
  },
  {
    name: 'Lekhana',
    role: 'Social Media',
    story:
      'Lekhana drives the club digital presence. She captures the energy of pickup games through photos and videos, manages the social accounts, and keeps the community connected.',
    impact:
      'She helps members stay engaged and informed about when and where the club is playing next.',
  },
  {
    name: 'Isra',
    role: 'Website Creator',
    story:
      'Isra created this website to help the club organize teams before each match. Picking captains and building teams can take a lot of time right before playing.',
    impact:
      'This site makes the process faster by letting players sign up, helping staff manage the roster, and making team setup easier before kickoff.',
  },
]

const routeFromHash = () => {
  const path = window.location.hash.replace('#', '')

  if (path === '/staff') {
    return 'staff'
  }

  if (path === '/about') {
    return 'about'
  }

  return 'home'
}

const normalizeName = (value) => value.trim().replace(/\s+/g, ' ')

const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const randomTeam = () => (Math.random() < 0.5 ? 'penny' : 'withoutPenny')

const getSkillLabel = (value) =>
  SKILL_LEVELS.find((level) => level.value === value)?.label ?? value

const getPlayerName = (player) => `${player.firstName} ${player.lastName}`

const normalizeCaptains = (captains) => ({
  penny: String(captains?.penny || ''),
  withoutPenny: String(captains?.withoutPenny || ''),
})

const randomCaptainId = (players, teamKey) => {
  const teamPlayers = players.filter((player) => player.team === teamKey)
  if (teamPlayers.length === 0) {
    return ''
  }

  return teamPlayers[Math.floor(Math.random() * teamPlayers.length)].id
}

const resolveCaptains = (players, captains) => {
  const currentCaptains = normalizeCaptains(captains)

  return TEAM_KEYS.reduce((nextCaptains, teamKey) => {
    const hasCurrentCaptain = players.some(
      (player) => player.team === teamKey && player.id === currentCaptains[teamKey],
    )

    nextCaptains[teamKey] = hasCurrentCaptain
      ? currentCaptains[teamKey]
      : randomCaptainId(players, teamKey)

    return nextCaptains
  }, {})
}

const captainsChanged = (currentCaptains, nextCaptains) =>
  TEAM_KEYS.some((teamKey) => currentCaptains[teamKey] !== nextCaptains[teamKey])

function useRoute() {
  const [route, setRoute] = useState(routeFromHash)

  useEffect(() => {
    const handleHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = (nextRoute) => {
    window.location.hash =
      nextRoute === 'staff' ? '/staff' : nextRoute === 'about' ? '/about' : '/'
    setRoute(nextRoute)
  }

  return [route, navigate]
}

function useCountdown(targetDate) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!targetDate) {
    return 'Waiting for the next soccer date'
  }

  const target = new Date(targetDate).getTime()
  if (Number.isNaN(target)) {
    return 'Waiting for the next soccer date'
  }

  const difference = target - now
  if (difference <= 0) {
    return 'Soccer is starting now'
  }

  const totalSeconds = Math.floor(difference / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`
  }

  return `${hours}h ${minutes}m ${seconds}s`
}

function formatMatchDate(value) {
  if (!value) {
    return 'Date not set'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Date not set'
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function toDateTimeLocal(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function App() {
  const [route, navigate] = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenuTimer = useRef(null)
  const captainSyncing = useRef(false)
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem(DARK_MODE_KEY) === 'true',
  )
  const [rosterState, setRosterState] = useState({ players: [], match: null })
  const [dataStatus, setDataStatus] = useState('Loading team board...')
  const [dataError, setDataError] = useState('')

  const clearMenuCloseTimer = () => {
    if (closeMenuTimer.current) {
      window.clearTimeout(closeMenuTimer.current)
      closeMenuTimer.current = null
    }
  }

  const openMenu = () => {
    clearMenuCloseTimer()
    setMenuOpen(true)
  }

  const scheduleMenuClose = () => {
    clearMenuCloseTimer()
    closeMenuTimer.current = window.setTimeout(() => setMenuOpen(false), 180)
  }

  const refreshState = async () => {
    const nextState = await loadState()
    setRosterState(nextState)
  }

  useEffect(() => {
    window.localStorage.setItem(DARK_MODE_KEY, String(darkMode))
  }, [darkMode])

  useEffect(() => clearMenuCloseTimer, [])

  useEffect(() => {
    return subscribeState(
      (nextState) => {
        setRosterState(nextState)
        setDataStatus(DATA_STATUS_LABELS[nextState.mode] ?? 'Team board loaded')
        setDataError(nextState.message ?? '')
      },
      (error) => {
        setDataStatus('Connection issue')
        setDataError(error.message)
      },
    )
  }, [])

  useEffect(() => {
    if (!rosterState.match || captainSyncing.current) {
      return
    }

    const currentCaptains = normalizeCaptains(rosterState.match.captains)
    const nextCaptains = resolveCaptains(rosterState.players, currentCaptains)

    if (!captainsChanged(currentCaptains, nextCaptains)) {
      return
    }

    captainSyncing.current = true
    updateMatch({
      ...rosterState.match,
      captains: nextCaptains,
    })
      .then(refreshState)
      .catch((error) => setDataError(error.message))
      .finally(() => {
        captainSyncing.current = false
      })
  }, [rosterState.match, rosterState.players])

  const teams = useMemo(
    () => ({
      penny: rosterState.players.filter((player) => player.team === 'penny'),
      withoutPenny: rosterState.players.filter(
        (player) => player.team === 'withoutPenny',
      ),
    }),
    [rosterState.players],
  )

  return (
    <div
      className={`app-shell ${route === 'staff' ? 'member-shell' : ''} ${
        darkMode ? 'dark-mode' : ''
      }`}
    >
      <SoccerBallRain />
      <Header
        dataStatus={dataStatus}
        menuOpen={menuOpen}
        onMenuEnter={openMenu}
        onMenuLeave={scheduleMenuClose}
        onMenuToggle={() => setMenuOpen((open) => !open)}
      />
      <SideMenu
        darkMode={darkMode}
        route={route}
        open={menuOpen}
        onDarkModeToggle={() => setDarkMode((enabled) => !enabled)}
        onClose={() => setMenuOpen(false)}
        onMenuEnter={clearMenuCloseTimer}
        onMenuLeave={scheduleMenuClose}
        onPrimaryAction={() => {
          navigate(route === 'staff' ? 'home' : 'staff')
          setMenuOpen(false)
        }}
        onAbout={() => {
          navigate('about')
          setMenuOpen(false)
        }}
        onHome={() => {
          navigate('home')
          setMenuOpen(false)
        }}
      />

      {route === 'staff' ? (
        <StaffPage
          rosterState={rosterState}
          refreshState={refreshState}
          onBack={() => navigate('home')}
        />
      ) : route === 'about' ? (
        <AboutPage />
      ) : (
        <PublicPage
          dataError={dataError}
          match={rosterState.match}
          refreshState={refreshState}
          teams={teams}
        />
      )}
    </div>
  )
}

function Header({ dataStatus, menuOpen, onMenuEnter, onMenuLeave, onMenuToggle }) {
  return (
    <header className="site-header">
      <a
        className="brand logo-brand"
        href="#/"
        aria-label={`Bellevue College soccer board. ${dataStatus}`}
      >
        <img src="/bc-logo.png" alt="Bellevue College" />
      </a>

      <button
        className="menu-button"
        type="button"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        title={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={onMenuToggle}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            onMenuEnter()
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            onMenuLeave()
          }
        }}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </header>
  )
}

function SideMenu({
  darkMode,
  route,
  open,
  onAbout,
  onClose,
  onDarkModeToggle,
  onHome,
  onPrimaryAction,
  onMenuEnter,
  onMenuLeave,
}) {
  const isStaffRoute = route === 'staff'
  const isAboutRoute = route === 'about'

  return (
    <>
      <button
        className={`scrim ${open ? 'open' : ''}`}
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      ></button>
      <aside
        className={`side-menu ${open ? 'open' : ''} ${
          isStaffRoute ? 'member-menu' : 'public-menu'
        }`}
        aria-hidden={!open}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            onMenuEnter()
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            onMenuLeave()
          }
        }}
      >
        <div className="menu-ball-background" aria-hidden="true">
          {MENU_BALLS.map((ball) => (
            <img
              key={ball.id}
              src="/football_ball.jfif"
              alt=""
              style={{
                '--menu-ball-delay': ball.delay,
                '--menu-ball-duration': ball.duration,
                '--menu-ball-left': ball.left,
                '--menu-ball-size': ball.size,
                '--menu-ball-spin': ball.spin,
              }}
            />
          ))}
        </div>
        <button className="drawer-close" type="button" onClick={onClose}>
          Close
        </button>
        <nav>
          {isAboutRoute ? (
            <button className="drawer-action" type="button" onClick={onHome}>
              Home
            </button>
          ) : null}
          <button className="drawer-action primary" type="button" onClick={onPrimaryAction}>
            {isStaffRoute ? 'Home' : 'Member login'}
          </button>
          <button
            className="drawer-action mode-toggle"
            type="button"
            aria-pressed={darkMode}
            onClick={onDarkModeToggle}
          >
            <span>Dark mode</span>
            <strong>{darkMode ? 'On' : 'Off'}</strong>
          </button>
          <button className="drawer-action" type="button" onClick={onAbout}>
            About
          </button>
        </nav>
      </aside>
    </>
  )
}

function AboutPage() {
  return (
    <main className="about-page" aria-label="About Bellevue College Soccer Club">
      <section className="about-hero">
        <p className="eyebrow">About the club</p>
        <h1>Bellevue College Soccer Club</h1>
        <p>
          A casual, co-ed student organization built around pickup soccer,
          community, and a shared love for the game.
        </p>
        <a className="about-home-link" href="#/">
          Home
        </a>
      </section>

      <section className="about-members" aria-label="Club members">
        {ABOUT_MEMBERS.map((member) => (
          <article className="about-member-card" key={member.name}>
            <div>
              <p className="section-kicker">{member.role}</p>
              <h2>{member.name}</h2>
            </div>
            <p>{member.story}</p>
            <p>{member.impact}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

function SoccerBallRain() {
  const [active, setActive] = useState(true)
  const balls = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        delay: `${Math.random() * 1.2}s`,
        duration: `${5.2 + Math.random() * 1.4}s`,
        left: `${Math.random() * 100}%`,
        size: `${22 + Math.random() * 28}px`,
        spin: `${Math.random() > 0.5 ? 1 : -1}`,
      })),
    [],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setActive(false), 7000)
    return () => window.clearTimeout(timer)
  }, [])

  if (!active) {
    return null
  }

  return (
    <div className="ball-rain" aria-hidden="true">
      {balls.map((ball) => (
        <img
          key={ball.id}
          src="/football_ball.jfif"
          alt=""
          style={{
            '--ball-delay': ball.delay,
            '--ball-duration': ball.duration,
            '--ball-left': ball.left,
            '--ball-size': ball.size,
            '--ball-spin': ball.spin,
          }}
        />
      ))}
    </div>
  )
}

function PublicPage({ dataError, match, refreshState, teams }) {
  return (
    <main>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Bellevue College pickup board</p>
          <h1>Soccer teams, saved live for everyone.</h1>
          <p className="hero-text">
            Add your name and skill level. The board randomly places you on a
            penny or without-penny team so everyone can see the teams before kickoff.
          </p>
        </div>
        <MatchCountdown match={match} />
      </section>

      <section className="main-grid" aria-label="Soccer signup and teams">
        <RegistrationForm refreshState={refreshState} />
        <TeamTables captains={match?.captains} teams={teams} />
      </section>

      {dataError ? <p className="system-alert">{dataError}</p> : null}
    </main>
  )
}

function RegistrationForm({ refreshState }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [skill, setSkill] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const cleanFirstName = normalizeName(firstName)
    const cleanLastName = normalizeName(lastName)

    if (!cleanFirstName || !cleanLastName || !skill) {
      setNotice('Enter your first name, last name, and skill level.')
      return
    }

    const team = randomTeam()
    const player = {
      id: createId(),
      firstName: cleanFirstName,
      lastName: cleanLastName,
      skill,
      team,
      joinedAt: new Date().toISOString(),
    }

    try {
      setSaving(true)
      await addPlayer(player)
      await refreshState()
      setFirstName('')
      setLastName('')
      setSkill('')
      setNotice(`You were added to ${TEAM_LABELS[team]}.`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="signup-panel" onSubmit={handleSubmit}>
      <div>
        <p className="section-kicker">Join the board</p>
        <h2>Player registration</h2>
      </div>

      <label>
        <span>First name</span>
        <input
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="First name"
        />
      </label>

      <label>
        <span>Last name</span>
        <input
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          placeholder="Last name"
        />
      </label>

      <label>
        <span>Skill level</span>
        <select value={skill} onChange={(event) => setSkill(event.target.value)}>
          <option value="">Choose your skill level</option>
          {SKILL_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </label>

      <button className="submit-button" type="submit" disabled={saving}>
        {saving ? 'Adding player...' : 'Submit'}
      </button>

      {notice ? <p className="form-notice">{notice}</p> : null}
    </form>
  )
}

function MatchCountdown({ match }) {
  const countdown = useCountdown(match?.nextMatchAt)

  return (
    <div className="match-strip" aria-live="polite">
      <span>Next soccer date</span>
      <strong>{formatMatchDate(match?.nextMatchAt)}</strong>
      <em>{countdown}</em>
    </div>
  )
}

function TeamTables({
  captains,
  editable = false,
  onCaptainChange,
  onPlayerChange,
  onRemove,
  teams,
}) {
  return (
    <div className="teams-panel">
      <TeamTable
        captains={captains}
        players={teams.penny}
        teamKey="penny"
        editable={editable}
        onCaptainChange={onCaptainChange}
        onPlayerChange={onPlayerChange}
        onRemove={onRemove}
      />
      <TeamTable
        captains={captains}
        players={teams.withoutPenny}
        teamKey="withoutPenny"
        editable={editable}
        onCaptainChange={onCaptainChange}
        onPlayerChange={onPlayerChange}
        onRemove={onRemove}
      />
    </div>
  )
}

function TeamTable({
  captains,
  editable,
  onCaptainChange,
  onPlayerChange,
  onRemove,
  players,
  teamKey,
}) {
  const targetTeam = teamKey === 'penny' ? 'withoutPenny' : 'penny'
  const moveLabel = teamKey === 'penny' ? 'Send to Team 2' : 'Send to Team 1'
  const captainId = normalizeCaptains(captains)[teamKey]
  const captain = players.find((player) => player.id === captainId)
  let captainLabel = 'No players yet'

  if (captain) {
    captainLabel = getPlayerName(captain)
  } else if (players.length) {
    captainLabel = 'Selecting soon'
  }

  return (
    <section className="team-table" aria-labelledby={`${teamKey}-title`}>
      <div className="table-title">
        <div className="table-title-copy">
          <h2 id={`${teamKey}-title`}>{TEAM_LABELS[teamKey]}</h2>
          {editable ? (
            <label className="captain-select">
              <span>Captain</span>
              <select
                value={captainId}
                disabled={players.length === 0}
                onChange={(event) => onCaptainChange(teamKey, event.target.value)}
              >
                <option value="">
                  {players.length === 0 ? 'No players yet' : 'Choose captain'}
                </option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {getPlayerName(player)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="captain-line">
              Captain:{' '}
              <strong>{captainLabel}</strong>
            </p>
          )}
        </div>
        <span>{players.length} players</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Skill level</th>
              {editable ? <th>Move</th> : null}
              {editable ? <th>Remove</th> : null}
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan={editable ? 5 : 3} className="empty-cell">
                  No players yet
                </td>
              </tr>
            ) : (
              players.map((player, index) => (
                <tr key={player.id}>
                  <td data-label="No." className="player-number">
                    {index + 1}.
                  </td>
                  <td data-label="Name">
                    {editable ? (
                      <div className="name-edit">
                        <input
                          aria-label="First name"
                          value={player.firstName}
                          onChange={(event) =>
                            onPlayerChange(player.id, {
                              firstName: event.target.value,
                            })
                          }
                        />
                        <input
                          aria-label="Last name"
                          value={player.lastName}
                          onChange={(event) =>
                            onPlayerChange(player.id, {
                              lastName: event.target.value,
                            })
                          }
                        />
                      </div>
                    ) : (
                      `${player.firstName} ${player.lastName}`
                    )}
                  </td>
                  <td data-label="Skill level">
                    {editable ? (
                      <select
                        aria-label="Skill level"
                        value={player.skill}
                        onChange={(event) =>
                          onPlayerChange(player.id, { skill: event.target.value })
                        }
                      >
                        {SKILL_LEVELS.map((level) => (
                          <option key={level.value} value={level.value}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      getSkillLabel(player.skill)
                    )}
                  </td>
                  {editable ? (
                    <td data-label="Move">
                      <button
                        className="icon-text-button move-team-button"
                        type="button"
                        onClick={() => onPlayerChange(player.id, { team: targetTeam })}
                      >
                        {moveLabel}
                      </button>
                    </td>
                  ) : null}
                  {editable ? (
                    <td data-label="Remove">
                      <button
                        className="icon-text-button danger"
                        type="button"
                        onClick={() => onRemove(player.id)}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StaffPage({ rosterState, refreshState, onBack }) {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('bcStaffAuthed') === STAFF_PASSWORD,
  )
  const [staffName, setStaffName] = useState(() => {
    const saved = sessionStorage.getItem('bcStaffName')
    return saved ? JSON.parse(saved) : null
  })

  if (!authenticated) {
    return (
      <StaffLogin
        onBack={onBack}
        onAuthenticated={() => {
          sessionStorage.setItem('bcStaffAuthed', STAFF_PASSWORD)
          setAuthenticated(true)
        }}
      />
    )
  }

  if (!staffName) {
    return <StaffIdentity onBack={onBack} onSaved={setStaffName} />
  }

  return (
    <StaffDashboard
      rosterState={rosterState}
      staffName={staffName}
      refreshState={refreshState}
      onBack={onBack}
    />
  )
}

function StaffLogin({ onBack, onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (password === STAFF_PASSWORD) {
      onAuthenticated()
      return
    }

    setError('Wrong staff password.')
  }

  return (
    <main className="staff-page member-login-page">
      <button className="back-button" type="button" onClick={onBack}>
        Back to public board
      </button>
      <section className="login-panel">
        <p className="section-kicker">Staff access</p>
        <h1>Staff member of the BC club can login only.</h1>
        <form onSubmit={handleSubmit}>
          <label>
            <span>Password</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Staff password"
            />
          </label>
          <button className="submit-button" type="submit">
            Login
          </button>
          {error ? <p className="form-notice error">{error}</p> : null}
        </form>
      </section>
    </main>
  )
}

function StaffIdentity({ onBack, onSaved }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [notice, setNotice] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const profile = {
      firstName: normalizeName(firstName),
      lastName: normalizeName(lastName),
    }

    if (!profile.firstName || !profile.lastName) {
      setNotice('Enter your first and last name.')
      return
    }

    sessionStorage.setItem('bcStaffName', JSON.stringify(profile))
    onSaved(profile)
  }

  return (
    <main className="staff-page member-login-page">
      <button className="back-button" type="button" onClick={onBack}>
        Back to public board
      </button>
      <section className="login-panel">
        <p className="section-kicker">Staff profile</p>
        <h1>Enter your staff name.</h1>
        <form onSubmit={handleSubmit}>
          <label>
            <span>First name</span>
            <input
              autoFocus
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="First name"
            />
          </label>
          <label>
            <span>Last name</span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Last name"
            />
          </label>
          <button className="submit-button" type="submit">
            Continue
          </button>
          {notice ? <p className="form-notice">{notice}</p> : null}
        </form>
      </section>
    </main>
  )
}

function StaffDashboard({ rosterState, staffName, refreshState, onBack }) {
  const [saving, setSaving] = useState('')
  const [draftPlayers, setDraftPlayers] = useState(rosterState.players)
  const [rosterDirty, setRosterDirty] = useState(false)
  const [matchDate, setMatchDate] = useState(() =>
    toDateTimeLocal(rosterState.match?.nextMatchAt),
  )

  useEffect(() => {
    if (!rosterDirty) {
      setDraftPlayers(rosterState.players)
    }
  }, [rosterDirty, rosterState.players])

  useEffect(() => {
    setMatchDate(toDateTimeLocal(rosterState.match?.nextMatchAt))
  }, [rosterState.match?.nextMatchAt])

  const teams = useMemo(
    () => ({
      penny: draftPlayers.filter((player) => player.team === 'penny'),
      withoutPenny: draftPlayers.filter(
        (player) => player.team === 'withoutPenny',
      ),
    }),
    [draftPlayers],
  )

  const savePlayers = async (players, message = 'Roster updated.') => {
    setSaving('Saving changes...')

    try {
      await replacePlayers(
        players.map((player) => ({
          ...player,
          firstName: normalizeName(player.firstName),
          lastName: normalizeName(player.lastName),
          updatedAt: new Date().toISOString(),
          updatedBy: `${staffName.firstName} ${staffName.lastName}`,
        })),
      )
      setRosterDirty(false)
      await refreshState()
      setSaving(message)
    } catch (error) {
      setSaving(error.message)
    }
  }

  const handlePlayerChange = (playerId, changes) => {
    setDraftPlayers((players) =>
      players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              ...changes,
            }
          : player,
      ),
    )
    setRosterDirty(true)
  }

  const handleRemove = (playerId) => {
    setDraftPlayers((players) => players.filter((player) => player.id !== playerId))
    setRosterDirty(true)
    setSaving('Player removed from the draft roster.')
  }

  const handleSaveRoster = async () => {
    await savePlayers(draftPlayers, 'Roster updated.')
  }

  const handleResetRoster = () => {
    setDraftPlayers(rosterState.players)
    setRosterDirty(false)
    setSaving('Roster draft reset.')
  }

  const handleCaptainChange = async (teamKey, playerId) => {
    setSaving('Saving captain...')

    try {
      await updateMatch({
        ...rosterState.match,
        captains: {
          ...normalizeCaptains(rosterState.match?.captains),
          [teamKey]: playerId,
        },
        updatedAt: new Date().toISOString(),
        updatedBy: `${staffName.firstName} ${staffName.lastName}`,
      })
      await refreshState()
      setSaving('Captain updated.')
    } catch (error) {
      setSaving(error.message)
    }
  }

  const handleMatchSubmit = async (event) => {
    event.preventDefault()

    const nextMatchAt = matchDate ? new Date(matchDate).toISOString() : ''
    setSaving('Saving soccer date...')

    try {
      await updateMatch({
        ...rosterState.match,
        nextMatchAt,
        captains: normalizeCaptains(rosterState.match?.captains),
        updatedAt: new Date().toISOString(),
        updatedBy: `${staffName.firstName} ${staffName.lastName}`,
      })
      await refreshState()
      setSaving('Soccer date updated.')
    } catch (error) {
      setSaving(error.message)
    }
  }

  return (
    <main className="staff-page member-dashboard-page">
      <div className="staff-toolbar">
        <button className="back-button" type="button" onClick={onBack}>
          Back to public board
        </button>
        <span>
          Logged in as {staffName.firstName} {staffName.lastName}
        </span>
      </div>

      <section className="admin-header">
        <div>
          <p className="section-kicker">Staff dashboard</p>
          <h1>Manage teams and the next soccer date.</h1>
        </div>
        <form className="date-form" onSubmit={handleMatchSubmit}>
          <label>
            <span>Next soccer date and time</span>
            <input
              type="datetime-local"
              value={matchDate}
              onChange={(event) => setMatchDate(event.target.value)}
            />
          </label>
          <button className="submit-button" type="submit">
            Save date
          </button>
        </form>
      </section>

      <section className="member-scroll-panel">
        {saving ? <p className="form-notice admin-notice">{saving}</p> : null}

        <section className="roster-actions" aria-label="Roster actions">
          <button
            className="submit-button"
            type="button"
            disabled={!rosterDirty}
            onClick={handleSaveRoster}
          >
            Save roster changes
          </button>
          <button
            className="back-button"
            type="button"
            disabled={!rosterDirty}
            onClick={handleResetRoster}
          >
            Reset draft
          </button>
        </section>

        <TeamTables
          captains={rosterState.match?.captains}
          editable
          teams={teams}
          onCaptainChange={handleCaptainChange}
          onPlayerChange={handlePlayerChange}
          onRemove={handleRemove}
        />
      </section>
    </main>
  )
}

export default App
