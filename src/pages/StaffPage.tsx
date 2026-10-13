import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DEFAULT_TEAM_COUNT, TEAM_COUNTS, type TeamCount, type TeamKey } from '../../shared/constants.ts'
import type { Player, PlayerPatch, State } from '../../shared/schemas.ts'
import { AnnouncementBanner } from '../components/AnnouncementBanner.tsx'
import { PreviousGamePanel } from '../components/PreviousGame.tsx'
import { TeamTables } from '../components/TeamTables.tsx'
import { api } from '../lib/api.ts'
import { errorMessage, usePreviousGame, useBoardCommand } from '../lib/board.ts'
import { session, useStaffSession, type StaffSession } from '../lib/session.ts'
import { groupByTeam, playerName } from '../lib/teams.ts'
import { formatMatchDate, fromClubInputValue, toClubInputValue } from '../lib/time.ts'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

type Notice = { text: string; kind: 'info' | 'success' | 'error' } | null

type StaffPageProps = {
  state: State | undefined
  onBack: () => void
}

export function StaffPage({ state, onBack }: StaffPageProps) {
  const staff = useStaffSession()

  if (!staff) {
    return <StaffLogin onBack={onBack} />
  }

  return <StaffDashboard state={state} staff={staff} onBack={onBack} />
}

function StaffLogin({ onBack }: { onBack: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPrevious, setShowPrevious] = useState(false)
  const previous = usePreviousGame(showPrevious)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const first = normalizeName(firstName)
    const last = normalizeName(lastName)

    if (!first || !last || !password) {
      setError('Enter your first name, last name, and the staff password.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const { token } = await api.login({ password, firstName: first, lastName: last })
      session.set({ token, name: `${first} ${last}` })
    } catch (loginError) {
      setError(errorMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="staff-page member-login-page">
      <button className="back-button" type="button" onClick={onBack}>
        Back to public board
      </button>
      <section className="login-panel">
        <p className="section-kicker">Staff access</p>
        <h1>Staff login only.</h1>
        <form onSubmit={handleSubmit}>
          <label>
            <span>First name</span>
            <input
              autoFocus
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
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Staff password"
            />
          </label>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? 'Checking password...' : 'Login'}
          </button>
          {error ? <p className="form-notice error">{error}</p> : null}
        </form>
        <button
          className="submit-button past-games-button"
          type="button"
          aria-expanded={showPrevious}
          onClick={() => setShowPrevious((open) => !open)}
        >
          Previous table
        </button>
        {showPrevious ? (
          <PreviousGamePanel
            game={previous.data?.game}
            loading={previous.isLoading}
            error={previous.error ? errorMessage(previous.error) : ''}
          />
        ) : null}
      </section>
    </main>
  )
}

type DashboardProps = {
  state: State | undefined
  staff: StaffSession
  onBack: () => void
}

function StaffDashboard({ state, staff, onBack }: DashboardProps) {
  const { run, pending } = useBoardCommand()
  const [notice, setNotice] = useState<Notice>(null)
  const [showPrevious, setShowPrevious] = useState(false)
  const previous = usePreviousGame(showPrevious)

  const match = state?.match
  const teamCount: TeamCount = match?.teamCount ?? DEFAULT_TEAM_COUNT
  const teams = useMemo(() => groupByTeam(state?.players ?? [], teamCount), [state?.players, teamCount])

  const [matchDate, setMatchDate] = useState(() => toClubInputValue(match?.nextMatchAt ?? null))
  const [announcement, setAnnouncement] = useState(match?.announcement ?? '')

  // A success message fades by itself; errors stay until the next action.
  useEffect(() => {
    if (notice?.kind !== 'success') {
      return
    }

    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Follow the server: when the stored date or announcement changes, show it.
  useEffect(() => setMatchDate(toClubInputValue(match?.nextMatchAt ?? null)), [match?.nextMatchAt])
  useEffect(() => setAnnouncement(match?.announcement ?? ''), [match?.announcement, match?.nextMatchAt])

  if (!state || !match) {
    return (
      <main className="staff-page member-dashboard-page">
        <p className="form-notice">Loading the team board...</p>
      </main>
    )
  }

  /** Runs a command and reports the outcome in the notice area. */
  const act = async (
    action: () => Promise<State>,
    working: string,
    done: string,
  ): Promise<boolean> => {
    setNotice({ text: working, kind: 'info' })
    const result = await run(action)
    setNotice(
      result.ok ? { text: done, kind: 'success' } : { text: result.error, kind: 'error' },
    )
    return result.ok
  }

  const handlePatch = (playerId: string, patch: PlayerPatch) =>
    void act(() => api.patchPlayer(playerId, patch), 'Saving changes...', 'Roster updated.')

  const handleRemove = (player: Player) => {
    if (window.confirm(`Remove ${playerName(player)} from the list?`)) {
      void act(
        () => api.removePlayer(player.id),
        'Removing player...',
        `${playerName(player)} was removed.`,
      )
    }
  }

  const handleCaptainChange = (team: TeamKey, playerId: string) =>
    void act(() => api.setCaptain(team, playerId), 'Saving captain...', 'Captain updated.')

  const handleRebalance = () =>
    void act(
      () => api.rebalance(),
      'Rebalancing...',
      'Teams were rebalanced by skill score.',
    )

  const handleTeamCount = (nextTeamCount: TeamCount) => {
    if (nextTeamCount !== teamCount) {
      void act(
        () => api.updateMatch({ teamCount: nextTeamCount }),
        `Changing to ${nextTeamCount} teams...`,
        `${nextTeamCount} balanced teams are now published.`,
      )
    }
  }

  const handleMatchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextMatchAt = fromClubInputValue(matchDate)

    if (matchDate && !nextMatchAt) {
      setNotice({ text: 'Enter a valid date and time.', kind: 'error' })
      return
    }

    const dateChanged = nextMatchAt !== match.nextMatchAt
    void act(
      () => api.updateMatch({ nextMatchAt }),
      'Saving soccer date...',
      dateChanged ? 'Soccer date updated. Registration table refreshed.' : 'Soccer date updated.',
    )
  }

  const saveAnnouncement = (text: string) =>
    void act(
      () => api.setAnnouncement(text),
      'Saving announcement...',
      text.trim() ? 'Announcement published.' : 'Announcement removed.',
    )

  return (
    <main className="staff-page member-dashboard-page">
      <AnnouncementBanner announcement={match.announcement} />
      <div className="staff-toolbar">
        <button className="back-button" type="button" onClick={onBack}>
          Back to public board
        </button>
        <span>Logged in as {staff.name}</span>
        <button className="back-button" type="button" onClick={session.clear}>
          Log out
        </button>
      </div>

      <section className="admin-header">
        <div>
          <p className="section-kicker">Staff dashboard</p>
          <h1>Manage teams and the next soccer date.</h1>
        </div>
        <div className="match-settings">
          <fieldset className="team-count-control">
            <legend>Number of teams</legend>
            <div className="team-count-options">
              {TEAM_COUNTS.map((option) => (
                <button
                  className="team-count-button"
                  type="button"
                  aria-pressed={teamCount === option}
                  disabled={pending}
                  key={option}
                  onClick={() => handleTeamCount(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <form className="date-form" onSubmit={handleMatchSubmit}>
            <label>
              <span>Next soccer date and time (Pacific)</span>
              <input
                type="datetime-local"
                value={matchDate}
                onChange={(event) => setMatchDate(event.target.value)}
              />
            </label>
            <button className="submit-button" type="submit" disabled={pending}>
              Save date
            </button>
          </form>
        </div>
      </section>

      <section className="member-scroll-panel">
        {notice ? (
          <p
            className={`form-notice admin-notice ${notice.kind === 'error' ? 'error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {notice.text}
          </p>
        ) : null}

        <form
          className="announcement-editor"
          onSubmit={(event) => {
            event.preventDefault()
            saveAnnouncement(announcement)
          }}
        >
          <h2>Announcement</h2>
          <p>
            Share a message for {formatMatchDate(match.nextMatchAt)}. It appears at the top of the
            public board and expires with the team tables, three hours after kickoff.
          </p>
          <label htmlFor="match-announcement">Announcement for this soccer date</label>
          <textarea
            id="match-announcement"
            rows={3}
            maxLength={1000}
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
          />
          <div className="roster-actions">
            <button
              className="submit-button"
              type="submit"
              disabled={pending || !match.nextMatchAt || !announcement.trim()}
            >
              Save announcement
            </button>
            <button
              className="back-button"
              type="button"
              disabled={pending || !match.announcement}
              onClick={() => saveAnnouncement('')}
            >
              Remove announcement
            </button>
          </div>
        </form>

        <section className="roster-actions" aria-label="Roster actions">
          <button
            className="back-button"
            type="button"
            disabled={pending || state.players.length < 2}
            onClick={handleRebalance}
          >
            Rebalance teams
          </button>
          <button
            className="back-button"
            type="button"
            aria-expanded={showPrevious}
            onClick={() => setShowPrevious((open) => !open)}
          >
            Previous table
          </button>
        </section>

        {showPrevious ? (
          <PreviousGamePanel
            game={previous.data?.game}
            loading={previous.isLoading}
            error={previous.error ? errorMessage(previous.error) : ''}
          />
        ) : null}

        <TeamTables
          editable
          busy={pending}
          captains={match.captains}
          teamCount={teamCount}
          teams={teams}
          onCaptainChange={handleCaptainChange}
          onPatch={handlePatch}
          onRemove={handleRemove}
        />
      </section>
    </main>
  )
}
