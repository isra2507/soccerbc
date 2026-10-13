import { ABOUT_MEMBERS } from '../content/about.ts'

export function AboutPage() {
  return (
    <main className="about-page" aria-label="About Bellevue College Soccer Club">
      <section className="about-hero">
        <p className="eyebrow">About the club</p>
        <h1>Bellevue College Soccer Club</h1>
        <p>
          A casual, co-ed student organization built around pickup soccer, community, and a shared
          love for the game.
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
