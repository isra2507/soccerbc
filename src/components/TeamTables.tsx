import { useEffect, useRef, useState } from 'react'
import {
  TEAM_LABELS,
  getActiveTeamKeys,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type { Captains, Player, PlayerPatch } from '../../shared/schemas.ts'
import { SKILL_LABELS, SKILL_LEVELS } from '../content/balance.ts'
import { TEAM_COLORS, playerName, teamSkillScore, type TeamPlayers } from '../lib/teams.ts'

type TeamTablesProps = {
  teamCount: TeamCount
  teams: TeamPlayers
  captains: Captains
  /** Staff view: every control saves straight to the server. */
  editable?: boolean
  busy?: boolean
  onCaptainChange?: (team: TeamKey, playerId: string) => void
  onPatch?: (playerId: string, patch: PlayerPatch) => void
  onRemove?: (player: Player) => void
}

export function TeamTables({ teamCount, teams, captains, ...rest }: TeamTablesProps) {
  const teamKeys = getActiveTeamKeys(teamCount)

  return (
    <div className="teams-panel" data-team-count={teamKeys.length}>
      {teamKeys.map((teamKey) => (
        <TeamTable
          key={teamKey}
          teamKey={teamKey}
          teamKeys={teamKeys}
          players={teams[teamKey]}
          captainId={captains[teamKey]}
          {...rest}
        />
      ))}
    </div>
  )
}

type TeamTableProps = Omit<TeamTablesProps, 'teamCount' | 'teams' | 'captains'> & {
  teamKey: TeamKey
  teamKeys: readonly TeamKey[]
  players: Player[]
  captainId: string
}

function TeamTable({
  teamKey,
  teamKeys,
  players,
  captainId,
  editable = false,
  busy = false,
  onCaptainChange,
  onPatch,
  onRemove,
}: TeamTableProps) {
  const captain = players.find((player) => player.id === captainId)
  let captainLabel = 'No players yet'

  if (captain) {
    captainLabel = playerName(captain)
  } else if (players.length) {
    captainLabel = 'Selecting soon'
  }

  return (
    <section
      className="team-table"
      data-team-color={TEAM_COLORS[teamKey]}
      aria-labelledby={`${teamKey}-title`}
    >
      <div className="table-title">
        <div className="table-title-copy">
          <h2 id={`${teamKey}-title`}>{TEAM_LABELS[teamKey]}</h2>
          {editable ? (
            <label className="captain-select">
              <span>Captain</span>
              <select
                value={captainId}
                disabled={players.length === 0 || busy}
                onChange={(event) => onCaptainChange?.(teamKey, event.target.value)}
              >
                <option value="">{players.length === 0 ? 'No players yet' : 'Choose captain'}</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {playerName(player)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="captain-line">
              Captain: <strong>{captainLabel}</strong>
            </p>
          )}
        </div>
        <span>
          {players.length} players | {teamSkillScore(players)} skill pts
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Skill level</th>
              {editable ? (
                <>
                  <th>Move to team</th>
                  <th>Remove</th>
                </>
              ) : null}
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
                        <NameInput
                          label="First name"
                          value={player.firstName}
                          disabled={busy}
                          onCommit={(firstName) => onPatch?.(player.id, { firstName })}
                        />
                        <NameInput
                          label="Last name"
                          value={player.lastName}
                          disabled={busy}
                          onCommit={(lastName) => onPatch?.(player.id, { lastName })}
                        />
                      </div>
                    ) : (
                      playerName(player)
                    )}
                  </td>
                  <td data-label="Skill level">
                    {editable ? (
                      <select
                        aria-label="Skill level"
                        value={player.skill}
                        disabled={busy}
                        onChange={(event) =>
                          onPatch?.(player.id, { skill: event.target.value as Player['skill'] })
                        }
                      >
                        {SKILL_LEVELS.map((level) => (
                          <option key={level.value} value={level.value}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      SKILL_LABELS[player.skill]
                    )}
                  </td>
                  {editable ? (
                    <td data-label="Move to team">
                      <select
                        aria-label={`Move ${playerName(player)} to team`}
                        value=""
                        disabled={busy}
                        onChange={(event) =>
                          onPatch?.(player.id, { team: event.target.value as TeamKey })
                        }
                      >
                        <option value="" disabled>
                          Move to…
                        </option>
                        {teamKeys
                          .filter((key) => key !== teamKey)
                          .map((key) => (
                            <option key={key} value={key}>
                              {TEAM_LABELS[key]}
                            </option>
                          ))}
                      </select>
                    </td>
                  ) : null}
                  {editable ? (
                    <td data-label="Remove">
                      <button
                        className="icon-text-button danger"
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove?.(player)}
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

type NameInputProps = {
  label: string
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}

/** Saves when you leave the box or press Enter, not on every keystroke. */
function NameInput({ label, value, disabled, onCommit }: NameInputProps) {
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(value)
      return
    }

    const clean = draft.trim().replace(/\s+/g, ' ')

    // A blank name is not allowed; put back what was there.
    if (!clean || clean === value) {
      setDraft(value)
      return
    }

    onCommit(clean)
  }

  return (
    <input
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
    />
  )
}
