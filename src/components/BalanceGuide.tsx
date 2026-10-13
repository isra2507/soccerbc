import { BALANCE_EXAMPLES, SKILL_LEVELS } from '../content/balance.ts'

export function BalanceGuide() {
  return (
    <section className="balance-guide" aria-label="Team balance guide">
      <div className="balance-guide-header">
        <p className="section-kicker">Balance system</p>
        <h2>Equal numbers help, but skill distribution makes the table fair.</h2>
        <p>
          Beginner counts as 1 point, Intermediate as 2, Semi-pro as 3, and Professional as 4. The
          table is recalculated whenever a new player joins or staff changes the roster, keeping
          every active team close. Captains are picked by skill priority: Semi-pro, then
          Professional, then Intermediate, then Beginner.
        </p>
      </div>

      <div className="skill-score-strip" aria-label="Skill point values">
        {SKILL_LEVELS.map((level) => (
          <div className="skill-score-item" key={level.value}>
            <span>{level.label.split(' (')[0]}</span>
            <strong>{level.points}</strong>
          </div>
        ))}
      </div>

      <ol className="balance-examples">
        {BALANCE_EXAMPLES.map((example) => (
          <li key={example.title}>
            <strong>{example.title}</strong>
            <p>{example.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
