type HeaderProps = {
  dataStatus: string
  menuOpen: boolean
  onMenuEnter: () => void
  onMenuLeave: () => void
  onMenuToggle: () => void
}

export function Header({ dataStatus, menuOpen, onMenuEnter, onMenuLeave, onMenuToggle }: HeaderProps) {
  return (
    <header className="site-header">
      <a
        className="brand logo-brand"
        href="#/"
        aria-label={`Bellevue College soccer board. ${dataStatus}`}
      >
        <img src="/bc-logo.webp" alt="Bellevue College" />
      </a>

      <button
        className="menu-button"
        type="button"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        title={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={(event) => {
          // With a mouse the hover has already opened the menu; clicking must not close it.
          const pointerType = (event.nativeEvent as PointerEvent).pointerType
          if (pointerType === 'mouse') {
            onMenuEnter()
          } else {
            onMenuToggle()
          }
        }}
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
