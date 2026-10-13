import { useMemo } from 'react'
import { DEFAULT_TEAM_COUNT } from '../../shared/constants.ts'
import type { State } from '../../shared/schemas.ts'
import { AnnouncementBanner } from '../components/AnnouncementBanner.tsx'
import { BalanceGuide } from '../components/BalanceGuide.tsx'
import { MatchCountdown } from '../components/MatchCountdown.tsx'
import { RegistrationForm } from '../components/RegistrationForm.tsx'
import { TeamTables } from '../components/TeamTables.tsx'
import {
  CONTACT_EMAILS,
  DISCORD_URL,
  NONDISCRIMINATION_NOTICE,
  WELCOME_TEXT,
} from '../content/club.ts'
import { groupByTeam } from '../lib/teams.ts'

const NO_CAPTAINS = { team1: '', team2: '', team3: '', team4: '' }

type PublicPageProps = {
  state: State | undefined
  error: string
}

export function PublicPage({ state, error }: PublicPageProps) {
  const match = state?.match
  const teamCount = match?.teamCount ?? DEFAULT_TEAM_COUNT
  const teams = useMemo(() => groupByTeam(state?.players ?? [], teamCount), [state?.players, teamCount])
  const registrationOpen = Boolean(match?.nextMatchAt)

  return (
    <main>
      <AnnouncementBanner announcement={match?.announcement} />
      <section className="discord-invite" aria-labelledby="discord-title">
        <div>
          <h2 id="discord-title">Join our Discord group</h2>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Join our Discord group
          </a>
          <p>Scan the QR code to connect with the club.</p>
        </div>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join our Discord group using this QR code"
        >
          <img
            src="/discord-qr.svg"
            width="160"
            height="160"
            alt="QR code for the Bellevue College Soccer Club Discord group"
          />
        </a>
      </section>
      <section className="hero-panel">
        <div className="hero-copy">
          <h1>Bellevue College Soccer Club</h1>
          <p className="hero-text">
            <strong>{WELCOME_TEXT}</strong>
          </p>
          <p className="club-contact">
            Have a question or concern, or need your name removed because you can’t make it? Send
            us a message in our{' '}
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              Discord group
            </a>
            . If you don’t have Discord, email{' '}
            {CONTACT_EMAILS.map((email, index) => (
              <span key={email}>
                {index > 0 ? ' or ' : ''}
                <a href={`mailto:${email}`}>{email}</a>
              </span>
            ))}
            .
          </p>
        </div>
        <MatchCountdown nextMatchAt={match?.nextMatchAt} />
      </section>

      <section className="main-grid" aria-label="Soccer signup and teams">
        <RegistrationForm registrationOpen={registrationOpen} />
        <TeamTables
          captains={match?.captains ?? NO_CAPTAINS}
          teamCount={teamCount}
          teams={teams}
        />
      </section>

      <BalanceGuide />

      {error ? <p className="system-alert">{error}</p> : null}
      <footer className="college-notice" aria-label="Nondiscrimination notice" tabIndex={0}>
        <p className="college-notice-scroll">{NONDISCRIMINATION_NOTICE}</p>
      </footer>
    </main>
  )
}
