import { useEffect, useState } from 'react'
import { updateMatch } from './dataStore'
import { matchResult, normalizeStatistics } from './statistics.js'

export function MatchStats({ statistics, member = false }) {
  const stats = normalizeStatistics(statistics)
  if (!member && !stats.public) return null
  return <section className="match-statistics" aria-label="Match statistics">
    {['goals', 'assists'].map((field) => <div key={field}>
      <h2>{field === 'goals' ? 'Top scorers' : 'Top assists'}</h2>
      <div className="stats-table-scroll"><table><thead><tr><th scope="col">Player</th><th scope="col">{field === 'goals' ? 'Goals' : 'Assists'}</th></tr></thead>
        <tbody>{[...stats.players].sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name)).map((player) =>
          <tr key={player.id}><td>{player.name}</td><td>{player[field]}</td></tr>)}
          {!stats.players.length && <tr><td colSpan={2}>No player statistics yet.</td></tr>}
        </tbody></table></div>
    </div>)}
    <div><h2>Last match</h2><div className="stats-table-scroll"><table>
      <thead><tr><th scope="col">Penny</th><th scope="col">No penny</th><th scope="col">Result</th></tr></thead>
      <tbody><tr><td>{stats.lastMatch.recorded ? stats.lastMatch.penny : '—'}</td><td>{stats.lastMatch.recorded ? stats.lastMatch.noPenny : '—'}</td><td>{matchResult(stats.lastMatch)}</td></tr></tbody>
    </table></div></div>
  </section>
}

export function MatchStatsEditor({ match, staffName, refreshState }) {
  const [draft, setDraft] = useState(() => normalizeStatistics(match?.statistics))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!dirty) setDraft(normalizeStatistics(match?.statistics))
  }, [match?.statistics, dirty])
  function change(next) { setDraft(next); setDirty(true) }
  function changePlayer(id, field, value) {
    change({ ...draft, players: draft.players.map((player) => player.id === id ? { ...player, [field]: value } : player) })
  }
  async function save(event) {
    event.preventDefault()
    if (draft.players.some((player) => !player.name.trim())) {
      setNotice('Enter a name for every player, or remove the empty row.')
      return
    }
    setSaving(true)
    try {
      await updateMatch({ ...match, statistics: normalizeStatistics(draft), updatedAt: new Date().toISOString(), updatedBy: `${staffName.firstName} ${staffName.lastName}` })
      await refreshState()
      setDirty(false)
      setNotice(draft.public ? 'Statistics saved and visible to the public.' : 'Statistics saved for members only.')
    } catch (error) { setNotice(error.message) }
    finally { setSaving(false) }
  }
  return <form className="statistics-editor" onSubmit={save}>
    <h2>Player statistics and last match</h2>
    <p>Any logged-in member can update names, goals, assists, and the Penny vs No penny score.</p>
    <fieldset disabled={saving}>
      <legend>Player statistics</legend>
      <div className="stats-table-scroll"><table><thead><tr><th>Name</th><th>Goals</th><th>Assists</th><th>Action</th></tr></thead>
        <tbody>{draft.players.map((player, index) => <tr key={player.id}>
          <td><input aria-label={`Player ${index + 1} name`} required maxLength={100} value={player.name} onChange={(event) => changePlayer(player.id, 'name', event.target.value)} /></td>
          {['goals', 'assists'].map((field) => <td key={field}><input aria-label={`Player ${index + 1} ${field}`} type="number" min="0" max="9007199254740991" step="1" required value={player[field]} onChange={(event) => changePlayer(player.id, field, event.target.value)} /></td>)}
          <td><button type="button" className="back-button" aria-label={`Remove player ${index + 1}`} onClick={() => change({ ...draft, players: draft.players.filter((item) => item.id !== player.id) })}>Remove</button></td>
        </tr>)}</tbody></table></div>
      <button type="button" className="back-button" onClick={() => change({ ...draft, players: [...draft.players, { id: crypto.randomUUID(), name: '', goals: 0, assists: 0 }] })}>Add player statistics</button>
    </fieldset>
    <fieldset disabled={saving}>
      <legend>Last match: Penny vs No penny</legend>
      <label className="stats-checkbox"><input type="checkbox" checked={draft.lastMatch.recorded} onChange={(event) => change({ ...draft, lastMatch: { ...draft.lastMatch, recorded: event.target.checked } })} />Record a last-match score</label>
      {draft.lastMatch.recorded && <div className="stats-score-inputs">{[['penny', 'Penny score'], ['noPenny', 'No penny score']].map(([field, label]) => <label key={field}>{label}<input type="number" min="0" max="9007199254740991" step="1" required value={draft.lastMatch[field]} onChange={(event) => change({ ...draft, lastMatch: { ...draft.lastMatch, [field]: event.target.value } })} /></label>)}</div>}
    </fieldset>
    <label className="stats-checkbox"><input type="checkbox" disabled={saving} checked={draft.public} onChange={(event) => change({ ...draft, public: event.target.checked })} />View to the public</label>
    <p>Save with this option selected to display all three tables on the public board. Clear it and save to hide them.</p>
    <button className="submit-button" disabled={saving || !dirty} type="submit">{saving ? 'Saving statistics…' : 'Save statistics'}</button>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <MatchStats statistics={draft} member />
  </form>
}
