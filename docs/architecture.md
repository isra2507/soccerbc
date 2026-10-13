# Architecture

## The one rule

**The backend and database are the source of truth.** The browser shows what the
server says and sends what the user did. It never decides what the roster, teams,
captains or history are, and it never saves state of its own.

## How the pieces fit

```
Browser (React SPA)
  │  fetch JSON; staff requests carry "Authorization: Bearer <token>"
  ▼
CloudFront ── S3                  static files
  ▼
API Gateway (HTTP API)
  ▼
Lambda  api/lambda.ts  →  api/handler.ts  (CORS, auth, rate limit, validation)
  │                           └─ api/routes/*  →  api/rules/*  (pure game rules)
  ▼
Store interface  api/store.ts
  ▼
DynamoDB  (api/store/dynamo.ts, the only file that imports the AWS SDK)
```

Locally the same handler runs behind `scripts/dev-api.ts` against DynamoDB Local
in Docker (`npm run dev:api`). There is no separate local mode.

## Code layout

```
shared/constants.ts   team keys, skills, limits, timing (used by API and UI)
shared/schemas.ts     zod schemas for every request, stored record and response
api/handler.ts        builds the handler from injected store/config/clock
api/routes/*          one file per resource; thin: parse → run a command → respond
api/rules/*           pure functions, no I/O, no hidden clock:
                        balance.ts    team assignment
                        captains.ts   captain selection
                        lifecycle.ts  rollover, archive, what readers see
                        commands.ts   every staff/public action as game → game
api/store.ts          Store interface + VersionConflict
api/store/dynamo.ts   DynamoDB implementation
api/migrate/legacy.ts old "state" blob → current game
src/lib/              api client (client.ts), data hooks (board.ts), session, time, countdown
src/components/       presentational pieces (tables, forms, menu, banner)
src/pages/            PublicPage, StaffPage, AboutPage
src/content/          club text, contacts, bios, balance guide (edit here, not in components)
scripts/              dev-api.ts, migrate-state.ts, hash-password.mjs
test/                 unit, API, store-contract, client, time and migration tests
e2e/                  Playwright tests against the real site, API and DynamoDB Local
```

## Who owns what

| Concern | Owner |
|---|---|
| Roster, date, team count, captains, announcement, history | Server (Lambda + DynamoDB) |
| Team balancing, captain choice | Server (`api/rules`) |
| Archiving a finished game | Server; computed on read, persisted by the next staff action |
| Staff password check, token issue and verification | Server |
| Validation, duplicates, roster cap, rate limits, CORS | Server |
| Rendering, forms, menus, dark mode | Browser |
| Staff session token | Browser, `sessionStorage` (cleared when the tab closes) |
| Dark-mode preference | Browser, `localStorage` |

## Data model

One versioned record, `pk = "GAME#current"`, holds the whole current game
(`shared/schemas.ts` → `gameSchema`): team count, date, announcement, players with
their assigned team and manual locks, captains, and the previous game.

Every change is: load → apply a pure command → save **only if the version is
unchanged** (conditional write). On a conflict the request reloads and retries (up
to 15 times with a short random delay), so simultaneous sign-ups are never lost.

Finished games are also written permanently as `pk = "ARCHIVE#<game id>"`,
atomically with the record that archives them (a DynamoDB transaction). Nothing
reads these yet; they exist so history and leaderboards can be built later.

Rate-limit counters are items with `pk = "ratelimit#..."` and an `expiresAt`
attribute (enable DynamoDB TTL on it).

### The clock

The board stays up until kickoff + 3 hours. `GET /state` is read-only: it computes
what readers should see from the stored game and the current time, so a finished
game already looks archived. The next successful change persists
that archive. No scheduled job is needed. (A rejected request, such as a sign-up
after the game, saves nothing.)

## API

The full contract (types, every endpoint, errors) is in [`api.md`](api.md); this is the summary.

`GET /state` and every command return the live board:
`{ players, match: { teamCount, nextMatchAt, announcement, captains, updatedAt, updatedBy } }`.
The previous game is a separate read, because it is large and changes at most once a
week, so clients fetch it on its own and can cache it much longer than the board.

| Method, path | Access | Body | Effect |
|---|---|---|---|
| `GET /state` | public | | The live board (read-only). |
| `GET /games/previous` | public | | `{ game }`: the latest finished game for a week, else `{ game: null }` (read-only). |
| `POST /players` | public, rate limited | `{firstName, lastName, skill}` | Sign up. Server picks id, time, team. |
| `POST /auth` | public, rate limited | `{password, firstName, lastName}` | Returns `{token, expiresIn}`; the name is signed into the token. |
| `PATCH /players/:id` | staff | any of `{firstName, lastName, skill, team}` | Edit. Setting `team` pins the player there. |
| `DELETE /players/:id` | staff | | Remove, rebalance. |
| `POST /rebalance` | staff | | Release all manual moves and captain picks, rebalance. |
| `PUT /match` | staff | `{nextMatchAt?, teamCount?}` | New date starts a fresh table; team count rebalances. |
| `PUT /match/announcement` | staff | `{text}` | Set or (empty) remove. Needs a date. |
| `PUT /captains/:team` | staff | `{playerId}` | Choose a captain (also pins them); empty clears. |

`updatedBy` always comes from the signed token, never from the request. Errors are
`{ message }` with 400 (invalid), 401, 404, 405, 409 (duplicate, roster full, or
too many simultaneous edits), 429 (rate limited) or 500 (generic).

## Behaviour worth knowing

- Teams are recomputed on every change, so unpinned players can move between teams
  as others join. Moving a player or choosing a captain pins them.
- A staff-chosen captain stays while that player is on the team; otherwise the
  captain is automatic (skill preference, earliest sign-up, current kept on ties).
- Changing the date starts a fresh table. If the old game had kicked off it is
  archived; a game that never happened is discarded, not recorded as history.
- Past dates are rejected.

## The frontend

It holds no roster state of its own. `useBoard()` polls `GET /state` (every 15 s while the tab
is visible); every action calls one API command and puts the response into the same query, so
the screen always shows what the server stored. The previous game is a separate query, fetched
only when someone opens it. Only the staff login (this tab's `sessionStorage`) and the
dark-mode preference are stored in the browser.

## Remaining work

Infrastructure is still hand-made; `template.yml` describes its replacement and
`DEPLOYMENT.md` has the cutover steps.
