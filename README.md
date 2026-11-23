# BC Soccer Club

Public React + Vite site for soccer player signup, automatic balancing across
two to four teams, staff team management, and a next-match countdown.

## Run locally

```bash
npm install
npm run dev
```

The app works locally with `localStorage` if no database is configured.

The shared board loads when a visitor opens or refreshes the page and after
their signup or staff save. It does not poll the backend or refresh on a timer.
Visitors refresh the page to see other people's changes. Countdown and
announcement timers only update the display and do not make network requests.

New signups must select Goalkeeper, Defender, Midfield, or Striker. Balancing
spreads goalkeepers as evenly as possible, then balances field players by team
size and skill, using positions to break ties. Conflicting manual goalkeeper
moves are adjusted to preserve goalkeeper coverage. Existing players without
a position remain on the board as “Not set” until staff updates their role.

Staff can reset statistics after confirming the prompt. Resetting keeps saved
player names and public visibility, sets goals and assists to zero, clears the
last match result, and saves immediately.

## Make Saved Names Public Online

The deployed site uses an AWS API Gateway + Lambda + DynamoDB backend so phones,
laptops, and other devices see the same roster and match date.

The production GitHub Actions workflow builds with:

```bash
VITE_API_BASE_URL=https://6oumqshk75.execute-api.us-east-1.amazonaws.com
```

Local development still uses `localStorage` if `VITE_API_BASE_URL` is not set.
To test the shared AWS backend locally, create `.env.local` with:

```bash
VITE_API_BASE_URL=https://6oumqshk75.execute-api.us-east-1.amazonaws.com
```

The Lambda source to paste into AWS is saved at `lambda/bcsoccerclub-api.mjs`.

Local development verifies the staff password with PBKDF2-SHA256. Production
verification happens in Lambda, which returns an eight-hour signed staff token;
the plain password is never stored in the frontend or browser session storage.

## Verify changes

```bash
npm test
npm run lint
npm run build
```
