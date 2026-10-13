import { useCallback, useEffect, useState } from 'react'

export type Route = 'home' | 'about' | 'staff'

const PATHS: Record<Route, string> = { home: '/', about: '/about', staff: '/staff' }

function routeFromHash(): Route {
  const path = window.location.hash.replace('#', '')
  return path === PATHS.staff ? 'staff' : path === PATHS.about ? 'about' : 'home'
}

/** Hash routing, so deep links work on plain static hosting (e.g. `/#/staff`). */
export function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState(routeFromHash)

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    window.location.hash = PATHS[next]
    setRoute(next)
  }, [])

  return [route, navigate]
}
