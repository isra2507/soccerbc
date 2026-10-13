import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { GAME_HOLD_MS } from '../../shared/constants.ts'
import type { State } from '../../shared/schemas.ts'
import { api } from './api.ts'
import { ApiError } from './client.ts'

const boardKey = ['state'] as const
const previousGameKey = ['previous-game'] as const

// How often an open, visible page re-checks the board. Hidden tabs do not poll, and a
// tab that comes back to the front refreshes immediately.
const POLL_MS = 15_000
const MAX_TIMER_MS = 2 ** 31 - 1

/** The live board, kept fresh. Also refetches the moment the game ends. */
export function useBoard() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: boardKey,
    queryFn: api.getState,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
  })
  const nextMatchAt = query.data?.match.nextMatchAt

  useEffect(() => {
    const start = nextMatchAt ? Date.parse(nextMatchAt) : Number.NaN

    if (Number.isNaN(start)) {
      return
    }

    // The server clears the board at kickoff + 3 hours; look again just after.
    const delay = start + GAME_HOLD_MS + 1_000 - Date.now()

    if (delay <= 0) {
      return
    }

    const timer = window.setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: boardKey }),
      Math.min(delay, MAX_TIMER_MS),
    )
    return () => window.clearTimeout(timer)
  }, [nextMatchAt, queryClient])

  return query
}

/** The last finished game. Only fetched when asked for, and rarely changes. */
export function usePreviousGame(enabled: boolean) {
  return useQuery({
    queryKey: previousGameKey,
    queryFn: api.getPreviousGame,
    enabled,
    staleTime: 5 * 60_000,
  })
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.'

export type CommandResult = { ok: true; state: State } | { ok: false; error: string }

/**
 * Runs one command against the API and puts the server's answer straight into the
 * board, so the screen shows exactly what was stored. Never throws: callers get
 * `{ ok: false, error }` with a message that is safe to show.
 */
export function useBoardCommand() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (action: () => Promise<State>): Promise<CommandResult> => {
      setPending(true)

      try {
        const state = await action()
        queryClient.setQueryData(boardKey, state)
        // A date change can archive a game, so the previous game may be out of date.
        void queryClient.invalidateQueries({ queryKey: previousGameKey })
        return { ok: true, state }
      } catch (error) {
        // A rejected edit (conflict, expired login) may mean our copy is stale.
        void queryClient.invalidateQueries({ queryKey: boardKey })
        return { ok: false, error: errorMessage(error) }
      } finally {
        setPending(false)
      }
    },
    [queryClient],
  )

  return { run, pending }
}
