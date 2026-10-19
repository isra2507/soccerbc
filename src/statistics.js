export function normalizeStatistics(value) {
  const count = (number) => Number.isSafeInteger(Number(number)) && Number(number) >= 0 ? Number(number) : 0
  return {
    public: value?.public === true,
    players: (Array.isArray(value?.players) ? value.players : []).map((player, index) => ({
      id: String(player?.id || `stat-${index}`),
      name: String(player?.name || '').trim().slice(0, 100),
      goals: count(player?.goals),
      assists: count(player?.assists),
    })).filter((player) => player.name),
    lastMatch: {
      recorded: value?.lastMatch?.recorded === true,
      penny: count(value?.lastMatch?.penny),
      noPenny: count(value?.lastMatch?.noPenny),
    },
  }
}

export function matchResult(lastMatch) {
  if (!lastMatch?.recorded) return 'No match result recorded.'
  const difference = lastMatch.penny - lastMatch.noPenny
  if (difference === 0) return 'Draw'
  return `${difference > 0 ? 'Penny' : 'No penny'} won by ${Math.abs(difference)} ${Math.abs(difference) === 1 ? 'goal' : 'goals'}`
}
