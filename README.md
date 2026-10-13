# BC Soccer Club

The sign-up and team board for the Bellevue College Soccer Club, which plays every
Friday at 11:00 AM on the college soccer field. Everyone is welcome, at any skill
level.

Picking fair teams used to eat the time right before kickoff. Now players put their
own name on the list, the site splits everyone into balanced teams automatically,
and staff only step in to adjust.

## How it works

**Players**
1. Staff open registration by setting the next game date. Until then sign-up is closed.
2. A player enters their name and skill level (beginner, intermediate, semi-pro or
   professional). There are no accounts.
3. The board updates for everyone: each team's players, its captain, and a countdown
   to kickoff. Teams are 1 (no pinnie), 2 (blue), 3 (red) and 4 (yellow).

**Teams are balanced by number of players first, then by skill**, strongest players
placed first, so each team ends up with a similar line-up. Teams can change as more
people join, until staff move someone, which pins them to that team.

**Staff** sign in with the shared staff password and a name, then can:
- set the game date and use two, three or four teams;
- move, rename, re-rate or remove players, or rebalance from scratch;
- choose a captain (otherwise the most experienced player on each team is picked);
- post an announcement that shows at the top of the board.

**After the game.** The board stays up until three hours after kickoff, then clears
for the next date. The previous game's teams stay visible for a week, and every
finished game is kept for the record.

## Run it locally

You need Node and Docker.

```bash
npm install
npm run dev:api   # DynamoDB Local + the API on http://localhost:3001
npm run dev       # the site, in a second terminal
```

The local staff password is `dev`, and local data resets when the container restarts.

```bash
npm test          # unit and API tests (storage tests run if DynamoDB Local is up)
npm run test:e2e  # browser tests; first run: npx playwright install chromium
npm run typecheck
npm run lint
```

## More

- [`docs/api.md`](docs/api.md): the API contract: every endpoint, type and error.
- [`docs/architecture.md`](docs/architecture.md): how the pieces fit, the API, and the
  rules behind teams, captains and the game lifecycle.
- [`DEPLOYMENT.md`](DEPLOYMENT.md): AWS setup, deploys and the data migration.
