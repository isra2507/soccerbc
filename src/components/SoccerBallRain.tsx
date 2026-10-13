import { useEffect, useMemo, useState, type CSSProperties } from 'react'

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A short burst of falling balls when the site opens. Skipped for reduced motion. */
export function SoccerBallRain() {
  const [active, setActive] = useState(() => !prefersReducedMotion())
  const balls = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        delay: `${Math.random() * 1.2}s`,
        duration: `${5.2 + Math.random() * 1.4}s`,
        left: `${Math.random() * 100}%`,
        size: `${22 + Math.random() * 28}px`,
        spin: `${Math.random() > 0.5 ? 1 : -1}`,
      })),
    [],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setActive(false), 7000)
    return () => window.clearTimeout(timer)
  }, [])

  if (!active) {
    return null
  }

  return (
    <div className="ball-rain" aria-hidden="true">
      {balls.map((ball) => (
        <img
          key={ball.id}
          src="/football_ball.jfif"
          alt=""
          style={
            {
              '--ball-delay': ball.delay,
              '--ball-duration': ball.duration,
              '--ball-left': ball.left,
              '--ball-size': ball.size,
              '--ball-spin': ball.spin,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
