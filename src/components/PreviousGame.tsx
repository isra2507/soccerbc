import { TEAM_LABELS, getActiveTeamKeys, type TeamKey } from '../../shared/constants.ts'
import type { ArchivedGame } from '../../shared/schemas.ts'
import { SKILL_LABELS } from '../content/balance.ts'
import { playerName } from '../lib/teams.ts'
import { formatMatchDate } from '../lib/time.ts'

type PanelProps = {
  game: ArchivedGame | null | undefined
  loading: boolean
  error: string
}

/** The previous game's teams, for people who want to check who played last week. */
export function PreviousGamePanel({ game, loading, error }: PanelProps) {
  return (
    <section className="past-games-panel" aria-label="Previous table">
      {loading ? (
        <p className="form-notice">Loading the previous table...</p>
      ) : error ? (
        <p className="form-notice error">{error}</p>
      ) : game ? (
        <PreviousGameCard game={game} />
      ) : (
        <p className="form-notice">No previous table saved yet.</p>
      )}
    </section>
  )
}

function PreviousGameCard({ game }: { game: ArchivedGame }) {
  return (
    <article className="past-game-card">
      <div>
        <p className="section-kicker">Previous table</p>
        <h2>{formatMatchDate(game.playedAt)}</h2>
      </div>
      <div className="past-game-teams">
        {getActiveTeamKeys(game.teamCount).map((teamKey) => (
          <PreviousGameTeam game={game} teamKey={teamKey} key={teamKey} />
        ))}
      </div>
    </article>
  )
}

function PreviousGameTeam({ game, teamKey }: { game: ArchivedGame; teamKey: TeamKey }) {
  const players = game.teams[teamKey]
  const captain = players.find((player) => player.id === game.captains[teamKey])

  return (
    <section className="past-game-team">
      <div className="past-game-team-title">
        <h3>{TEAM_LABELS[teamKey]}</h3>
        <span>{players.length} players</span>
      </div>
      <p>
        Captain: <strong>{captain ? playerName(captain) : 'Not saved'}</strong>
      </p>
      {players.length === 0 ? (
        <p className="empty-cell">No players saved</p>
      ) : (
        <ol>
          {players.map((player) => (
            <li key={player.id}>
              <span>{playerName(player)}</span>
              <em>{SKILL_LABELS[player.skill]}</em>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
