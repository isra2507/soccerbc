import { z } from 'zod'
import {
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_NAME_LENGTH,
  SKILLS,
  TEAM_COUNTS,
  TEAM_KEYS,
} from './constants.ts'

const hasControlCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })

// ---- Inputs (what clients send) ------------------------------------------

export const nameSchema = z
  .string({ error: 'A name is required.' })
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'First name and last name are required.')
      .max(MAX_NAME_LENGTH, `Names must be ${MAX_NAME_LENGTH} characters or fewer.`)
      .refine((value) => !hasControlCharacter(value), 'Names contain invalid characters.'),
  )

export const skillSchema = z.enum(SKILLS, { error: 'Choose a skill level.' })
export const teamKeySchema = z.enum(TEAM_KEYS, { error: 'Unknown team.' })
export const teamCountSchema = z.union(
  TEAM_COUNTS.map((count) => z.literal(count)) as [
    z.ZodLiteral<2>,
    z.ZodLiteral<3>,
    z.ZodLiteral<4>,
  ],
  { error: 'Choose 2, 3 or 4 teams.' },
)

export const signupInputSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  skill: skillSchema,
})
export type SignupInput = z.infer<typeof signupInputSchema>

export const playerPatchSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    skill: skillSchema,
    team: teamKeySchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Nothing to change.')
export type PlayerPatch = z.infer<typeof playerPatchSchema>

const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date and time.')

export const matchInputSchema = z
  .object({
    nextMatchAt: isoInstant.nullable(),
    teamCount: teamCountSchema,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Nothing to change.')
export type MatchInput = z.infer<typeof matchInputSchema>

export const announcementInputSchema = z.object({
  text: z
    .string({ error: 'Announcement text is required.' })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(MAX_ANNOUNCEMENT_LENGTH, `Announcements must be ${MAX_ANNOUNCEMENT_LENGTH} characters or fewer.`),
    ),
})

export const captainInputSchema = z.object({
  // An empty string clears the manual choice so the captain is picked automatically.
  playerId: z.string({ error: 'Choose a player.' }).max(64),
})

export const authInputSchema = z.object({
  password: z.string({ error: 'Enter the staff password.' }).max(200),
  firstName: nameSchema,
  lastName: nameSchema,
})

// ---- Stored and returned shapes ------------------------------------------

export const playerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  skill: skillSchema,
  team: teamKeySchema,
  manualTeam: z.boolean(),
  joinedAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type Player = z.infer<typeof playerSchema>

const teamRecord = <T extends z.ZodType>(value: T) =>
  z.object({
    team1: value,
    team2: value,
    team3: value,
    team4: value,
  })

export const captainsSchema = teamRecord(z.string())
export type Captains = z.infer<typeof captainsSchema>

export const archivedPlayerSchema = playerSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  skill: true,
  team: true,
})
export type ArchivedPlayer = z.infer<typeof archivedPlayerSchema>

export const archivedGameSchema = z.object({
  id: z.string(),
  playedAt: z.string(),
  archivedAt: z.string(),
  teamCount: teamCountSchema,
  captains: captainsSchema,
  teams: teamRecord(z.array(archivedPlayerSchema)),
})
export type ArchivedGame = z.infer<typeof archivedGameSchema>

// The one stored, versioned record for the current game.
export const gameSchema = z.object({
  teamCount: teamCountSchema,
  nextMatchAt: z.string().nullable(),
  announcement: z.string(),
  players: z.array(playerSchema),
  captains: captainsSchema,
  // Teams whose captain was chosen by staff and must not be auto-replaced.
  manualCaptains: teamRecord(z.boolean()),
  previousGame: archivedGameSchema.nullable(),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type Game = z.infer<typeof gameSchema>

// GET /state and every successful command return this: the live board only.
export const stateSchema = z.object({
  players: z.array(playerSchema),
  match: z.object({
    teamCount: teamCountSchema,
    nextMatchAt: z.string().nullable(),
    announcement: z.string(),
    captains: captainsSchema,
    updatedAt: z.string(),
    updatedBy: z.string(),
  }),
})
export type State = z.infer<typeof stateSchema>

// GET /games/previous: the latest finished game, if it is still worth showing.
export const previousGameResponseSchema = z.object({
  game: archivedGameSchema.nullable(),
})
export type PreviousGameResponse = z.infer<typeof previousGameResponseSchema>
