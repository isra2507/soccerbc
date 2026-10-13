import { useEffect, useRef, useState } from 'react'
import './App.css'
import { Header } from './components/Header.tsx'
import { SideMenu } from './components/SideMenu.tsx'
import { SoccerBallRain } from './components/SoccerBallRain.tsx'
import { errorMessage, useBoard } from './lib/board.ts'
import { useRoute } from './lib/route.ts'
import { AboutPage } from './pages/AboutPage.tsx'
import { PublicPage } from './pages/PublicPage.tsx'
import { StaffPage } from './pages/StaffPage.tsx'

const DARK_MODE_KEY = 'bcSoccerDarkMode'

function readDarkMode(): boolean {
  try {
    return window.localStorage.getItem(DARK_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export default function App() {
  const [route, navigate] = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(readDarkMode)
  const closeMenuTimer = useRef<number | null>(null)
  const board = useBoard()

  const clearMenuCloseTimer = () => {
    if (closeMenuTimer.current !== null) {
      window.clearTimeout(closeMenuTimer.current)
      closeMenuTimer.current = null
    }
  }

  const openMenu = () => {
    clearMenuCloseTimer()
    setMenuOpen(true)
  }

  const scheduleMenuClose = () => {
    clearMenuCloseTimer()
    closeMenuTimer.current = window.setTimeout(() => setMenuOpen(false), 180)
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(DARK_MODE_KEY, String(darkMode))
    } catch {
      // The preference just won't be remembered.
    }
  }, [darkMode])

  useEffect(() => clearMenuCloseTimer, [])

  const go = (next: typeof route) => {
    navigate(next)
    setMenuOpen(false)
  }

  const dataStatus = board.isError
    ? 'Connection issue'
    : board.data
      ? 'Live online board'
      : 'Loading team board...'

  return (
    <div
      className={`app-shell ${route === 'staff' ? 'member-shell' : ''} ${darkMode ? 'dark-mode' : ''}`}
    >
      <SoccerBallRain />
      <Header
        dataStatus={dataStatus}
        menuOpen={menuOpen}
        onMenuEnter={openMenu}
        onMenuLeave={scheduleMenuClose}
        onMenuToggle={() => setMenuOpen((open) => !open)}
      />
      <SideMenu
        darkMode={darkMode}
        route={route}
        open={menuOpen}
        onDarkModeToggle={() => setDarkMode((enabled) => !enabled)}
        onClose={() => setMenuOpen(false)}
        onMenuEnter={clearMenuCloseTimer}
        onMenuLeave={scheduleMenuClose}
        onPrimaryAction={() => go(route === 'staff' ? 'home' : 'staff')}
        onAbout={() => go('about')}
        onHome={() => go('home')}
      />

      {route === 'staff' ? (
        <StaffPage state={board.data} onBack={() => go('home')} />
      ) : route === 'about' ? (
        <AboutPage />
      ) : (
        <PublicPage state={board.data} error={board.isError ? errorMessage(board.error) : ''} />
      )}
    </div>
  )
}
