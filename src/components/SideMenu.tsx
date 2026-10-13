import type { CSSProperties } from 'react'
import type { Route } from '../lib/route.ts'

const MENU_BALLS = Array.from({ length: 16 }, (_, index) => ({
  id: index,
  delay: `${(index % 8) * 0.42}s`,
  duration: `${4.8 + (index % 5) * 0.45}s`,
  left: `${5 + ((index * 23) % 88)}%`,
  size: `${18 + (index % 4) * 7}px`,
  spin: `${index % 2 === 0 ? 1 : -1}`,
}))

type SideMenuProps = {
  darkMode: boolean
  route: Route
  open: boolean
  onAbout: () => void
  onClose: () => void
  onDarkModeToggle: () => void
  onHome: () => void
  onPrimaryAction: () => void
  onMenuEnter: () => void
  onMenuLeave: () => void
}

export function SideMenu({
  darkMode,
  route,
  open,
  onAbout,
  onClose,
  onDarkModeToggle,
  onHome,
  onPrimaryAction,
  onMenuEnter,
  onMenuLeave,
}: SideMenuProps) {
  const isStaffRoute = route === 'staff'
  const isAboutRoute = route === 'about'

  return (
    <>
      <button
        className={`scrim ${open ? 'open' : ''}`}
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      ></button>
      <aside
        className={`side-menu ${open ? 'open' : ''} ${isStaffRoute ? 'member-menu' : 'public-menu'}`}
        aria-hidden={!open}
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
        <div className="menu-ball-background" aria-hidden="true">
          {MENU_BALLS.map((ball) => (
            <img
              key={ball.id}
              src="/football_ball.jfif"
              alt=""
              style={
                {
                  '--menu-ball-delay': ball.delay,
                  '--menu-ball-duration': ball.duration,
                  '--menu-ball-left': ball.left,
                  '--menu-ball-size': ball.size,
                  '--menu-ball-spin': ball.spin,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <button className="drawer-close" type="button" onClick={onClose}>
          Close
        </button>
        <nav>
          {isAboutRoute ? (
            <button className="drawer-action" type="button" onClick={onHome}>
              Home
            </button>
          ) : null}
          <button className="drawer-action primary" type="button" onClick={onPrimaryAction}>
            {isStaffRoute ? 'Home' : 'Staff login'}
          </button>
          <button
            className="drawer-action mode-toggle"
            type="button"
            aria-pressed={darkMode}
            onClick={onDarkModeToggle}
          >
            <span>Dark mode</span>
            <strong>{darkMode ? 'On' : 'Off'}</strong>
          </button>
          <button className="drawer-action" type="button" onClick={onAbout}>
            About
          </button>
        </nav>
      </aside>
    </>
  )
}
