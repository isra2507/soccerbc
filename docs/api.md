# API contract

The HTTP API behind the site. All bodies are JSON. This is the contract the frontend
codes against; the schemas it is generated from live in `shared/schemas.ts`, and
`test/api.test.ts` pins the behaviour described here.

## Basics

- **Base URL:** production `https://6oumqshk75.execute-api.us-east-1.amazonaws.com`
  (to move behind CloudFront at `/api` later); local `http://localhost:3001`.
- **Format:** requests with a body send `Content-Type: application/json`. Responses
  are `application/json`. Times are ISO 8601 UTC strings (`2026-10-09T18:00:00.000Z`).
- **CORS:** only the origins configured in `ALLOWED_ORIGINS` (the website and local
  dev) get an `access-control-allow-origin` header. Methods: `GET POST PUT PATCH DELETE OPTIONS`.
- **Body size:** at most 100,000 bytes.
- **Authentication:** staff routes need `Authorization: Bearer <token>` from `POST /auth`.
  Tokens last 8 hours and carry the staff member's name. There is no refresh; log in again.
- **No versioning yet.** Breaking changes will be coordinated with the frontend deploy.

## Reading the live board

Every successful command returns the same `State` as `GET /state`, so a client can
render the response directly without refetching.

### Types

```ts
type TeamKey = 'team1' | 'team2' | 'team3' | 'team4'
// Team 1 plays without a pinnie (bib); teams 2, 3 and 4 wear blue, red and yellow.
// Only the first `teamCount` keys are in use.
type Skill = 'beginner' | 'intermediate' | 'semi-pro' | 'professional'

type Player = {
  id: string
  firstName: string
  lastName: string
  skill: Skill
  team: TeamKey            // always one of the teams in use
  manualTeam: boolean      // true when staff pinned them to `team`
  joinedAt: string
  updatedAt: string        // '' until staff edit the player
  updatedBy: string        // '' until staff edit the player
}

type State = {
  players: Player[]        // in sign-up order
  match: {
    teamCount: 2 | 3 | 4
    nextMatchAt: string | null    // null: no game scheduled, sign-up is closed
    announcement: string          // '' when none
    captains: Record<TeamKey, string>   // player id, '' when the team has no one
    updatedAt: string
    updatedBy: string
  }
}

type ArchivedGame = {
  id: string               // 'game-<kickoff epoch ms>'
  playedAt: string         // kickoff
  archivedAt: string       // kickoff + 3 hours
  teamCount: 2 | 3 | 4
  captains: Record<TeamKey, string>
  teams: Record<TeamKey, Pick<Player, 'id' | 'firstName' | 'lastName' | 'skill' | 'team'>[]>
                           // all four keys always present; unused teams are []
}
```

### `GET /state` (public)

The live board. Read-only, safe to poll. Once the game is over (kickoff + 3 hours) it
already shows an empty board with `nextMatchAt: null`, even before anyone has saved
anything.

```json
200 {
  "players": [],
  "match": { "teamCount": 2, "nextMatchAt": null, "announcement": "",
             "captains": { "team1": "", "team2": "", "team3": "", "team4": "" },
             "updatedAt": "", "updatedBy": "" }
}
```

### `GET /games/previous` (public)

The most recent finished game, for one week after it ended, otherwise `null`. Read-only
and changes at most once a week, so it can be cached for much longer than `/state`.

```json
200 { "game": null }
200 { "game": { "id": "game-1791547200000", "playedAt": "2026-10-09T12:00:00.000Z",
                "archivedAt": "2026-10-09T15:00:00.000Z", "teamCount": 3,
                "captains": { "team1": "id-3", "team2": "id-2", "team3": "id-1", "team4": "" },
                "teams": { "team1": [ { "id": "id-3", "firstName": "Cy", "lastName": "Test",
                                        "skill": "semi-pro", "team": "team1" } ],
                           "team2": [ ... ], "team3": [ ... ], "team4": [] } } }
```

## Public actions

### `POST /players`: sign up (rate limited)

```json
{ "firstName": "Ann", "lastName": "Test", "skill": "professional" }
```

- Names: trimmed, inner whitespace collapsed, 1 to 40 characters, no control characters.
- The server chooses `id`, `joinedAt`, `team` and `manualTeam`. Any other fields are ignored.
- Returns `200` with the new `State`. Every unpinned player may land on a different team
  than before (see "Teams are recomputed").

| Status | Message |
|---|---|
| 400 | `Registration opens after staff sets the next soccer date.` (no game scheduled, or the last one is over) |
| 400 | `A name is required.` (missing field) / `First name and last name are required.` (blank) / `Names must be 40 characters or fewer.` / `Names contain invalid characters.` / `Choose a skill level.` |
| 409 | `That name is already on the list.` (same first and last name, ignoring case) |
| 409 | `The roster is full. Please contact the club.` (120 players) |
| 409 | `The roster changed at the same time. Please try again.` (see "Concurrent edits") |
| 429 | Rate limit: 30 sign-ups per 10 minutes per IP. |

### `POST /auth`: staff login (rate limited)

```json
{ "password": "...", "firstName": "Sam", "lastName": "Coach" }
200 { "token": "<payload>.<signature>", "expiresIn": 28800 }
```

The name is signed into the token and recorded as `updatedBy` on everything this
person changes. Errors: `400` for missing fields (`Enter the staff password.`, `A name is required.`), `401 Wrong staff password.`,
`429` after 10 attempts per 15 minutes per IP, `500` if the server has no password configured.

## Staff actions

All need `Authorization: Bearer <token>`; without a valid one they return
`401 { "message": "Staff login is required." }`. All return `200` with the new `State`.

### `PATCH /players/:id`: edit or move a player

Any of `firstName`, `lastName`, `skill`, `team` (at least one):

```json
{ "team": "team3", "skill": "intermediate" }
```

Setting `team` pins the player there (`manualTeam: true`). Pinned players stay put when
others are rebalanced. Errors: `404 Player not found.`, `400 That team is not in use for this game.`,
`409 That name is already on the list.` (renaming onto another player), `400 Nothing to change.`

### `DELETE /players/:id`: remove a player

Errors: `404 Player not found.`

### `POST /rebalance`: start over

Releases every pin and every staff-chosen captain, then rebuilds balanced teams.
Body is ignored (send `{}`).

### `PUT /match`: date and team count

Either or both:

```json
{ "nextMatchAt": "2026-10-16T18:00:00.000Z", "teamCount": 3 }
```

- `teamCount` (2, 3 or 4): rebalances everyone onto the new teams and releases pins and captain picks.
- `nextMatchAt`: **starts a fresh table**: the roster, announcement and captains are cleared. If the
  previous game had already kicked off it is saved to history; a game that never happened is
  discarded. `null` clears the date and closes sign-up. Setting the same date again changes nothing.
- Errors: `400 That date has already passed. Choose an upcoming date.` (more than 3 hours past),
  `400 Enter a valid date and time.`, `400 Choose 2, 3 or 4 teams.`, `400 Nothing to change.`

### `PUT /match/announcement`: banner message

```json
{ "text": "Bring water" }
```

Trimmed, up to 1000 characters. An empty string removes it. It disappears automatically
when the game ends. Errors: `400 Set an upcoming soccer date before publishing an announcement.`,
`400 Announcements must be 1000 characters or fewer.`

### `PUT /captains/:team`: choose a captain

`:team` is a `TeamKey` in use. Body `{ "playerId": "<id>" }` chooses that player and also pins
them to the team; `{ "playerId": "" }` hands the choice back to automatic. A chosen captain stays
until they leave that team. Errors: `400 Unknown team.`, `400 That team is not in use for this game.`,
`400 That player is not on this team.`

## Behaviour to know

- **Teams are recomputed on every change.** Players are placed strongest-first onto the team with
  the fewest players, then the lowest skill total, so one sign-up or edit can move several
  unpinned players. Pinned players (`manualTeam`) never move. Clients should render the response
  and not assume anyone stays where they were.
- **Captains:** a staff-chosen captain is kept while on the team. Otherwise the best-preferred skill wins
  (semi-pro, professional, intermediate, beginner), earliest sign-up breaks ties, and the current captain
  is kept when equally preferred.
- **The game lifecycle:** the board stays up until kickoff + 3 hours, then reads as an empty board with
  `nextMatchAt: null` and the game appears at `/games/previous`. The change is saved by the next
  successful staff action. A rejected request saves nothing.
- **Concurrent edits:** each change is saved only if nobody saved first; otherwise it reloads and
  retries (up to 15 times, with a short random delay). If it still can't, the response is `409`
  with `The roster changed at the same time. Please try again.` and the request is safe to repeat.
- **Idempotency:** `DELETE`, `PUT`, `PATCH` and `POST /rebalance` can be repeated safely. `POST /players`
  twice returns `409` (duplicate name) the second time.
- **Reads never write**, so polling is harmless.

## Errors

Every error has the same shape; show `message` to the user:

```json
{ "message": "That name is already on the list." }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input, or the action isn't allowed right now (the message says why) |
| 401 | Missing, invalid, forged or expired staff token (log in again) |
| 404 | Unknown route, or a player id that doesn't exist |
| 405 | The path exists but not for this method |
| 409 | Duplicate name, roster full, or too many simultaneous edits |
| 413 | Request body over 100,000 bytes |
| 429 | Rate limited; wait `retry-after` seconds |
| 500 | Unexpected failure (`Server error.`); details are logged, never returned |

`400` also covers malformed JSON (`Request body must be valid JSON.`) and a body that isn't an
object (`Request body must be a JSON object.`).
