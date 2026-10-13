import { useState, type FormEvent } from 'react'
import type { Skill } from '../../shared/constants.ts'
import { SKILL_LEVELS } from '../content/balance.ts'
import { api } from '../lib/api.ts'
import { useBoardCommand } from '../lib/board.ts'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

export function RegistrationForm({ registrationOpen }: { registrationOpen: boolean }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [skill, setSkill] = useState<Skill | ''>('')
  const [notice, setNotice] = useState('')
  const { run, pending } = useBoardCommand()
  const formDisabled = pending || !registrationOpen

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!registrationOpen) {
      setNotice('Registration opens after staff sets the next soccer date.')
      return
    }

    const cleanFirstName = normalizeName(firstName)
    const cleanLastName = normalizeName(lastName)

    if (!cleanFirstName || !cleanLastName || !skill) {
      setNotice('Enter your first name, last name, and skill level.')
      return
    }

    const result = await run(() =>
      api.signUp({ firstName: cleanFirstName, lastName: cleanLastName, skill }),
    )

    if (result.ok) {
      setFirstName('')
      setLastName('')
      setSkill('')
      setNotice('You were added. The table rebalanced by skill score.')
    } else {
      setNotice(result.error)
    }
  }

  return (
    <form className="signup-panel" onSubmit={handleSubmit}>
      <div>
        <p className="section-kicker">Join the board</p>
        <h2>Player registration</h2>
      </div>

      {!registrationOpen ? (
        <p className="form-notice">Registration opens after staff sets the next soccer date.</p>
      ) : null}

      <label>
        <span>First name</span>
        <input
          autoComplete="given-name"
          disabled={formDisabled}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="First name"
        />
      </label>

      <label>
        <span>Last name</span>
        <input
          autoComplete="family-name"
          disabled={formDisabled}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          placeholder="Last name"
        />
      </label>

      <label>
        <span>Skill level</span>
        <select
          disabled={formDisabled}
          value={skill}
          onChange={(event) => setSkill(event.target.value as Skill | '')}
        >
          <option value="">Choose your skill level</option>
          {SKILL_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </label>

      <button className="submit-button" type="submit" disabled={formDisabled}>
        {pending ? 'Adding player...' : registrationOpen ? 'Submit' : 'Date needed first'}
      </button>

      {notice ? <p className="form-notice">{notice}</p> : null}
    </form>
  )
}
