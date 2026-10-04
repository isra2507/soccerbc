export function getActiveAnnouncement(match, now = Date.now()) {
  const start = Date.parse(match?.nextMatchAt || '')
  if (!Number.isFinite(start) || now >= start + 3 * 60 * 60 * 1000) return ''
  return String(match?.announcement || '').trim().slice(0, 1000)
}
