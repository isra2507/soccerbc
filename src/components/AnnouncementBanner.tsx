/** The server already drops the announcement when the game ends, so this just shows it. */
export function AnnouncementBanner({ announcement }: { announcement: string | undefined }) {
  if (!announcement) {
    return null
  }

  return (
    <aside className="game-notice" aria-label="Match announcement" tabIndex={0}>
      <p className="game-notice-scroll" key={announcement}>
        <strong>Announcement: </strong>
        {announcement}
      </p>
    </aside>
  )
}
