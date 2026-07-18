# BC Soccer Club

Public React + Vite site for soccer player signup, randomized team assignment,
staff team management, and a next-match countdown.

## Run locally

```bash
npm install
npm run dev
```

The app works locally with `localStorage` if no database is configured.

## Make saved names public online

The deployed site needs a shared database for phones, laptops, and other
devices to see the same roster and match date. Without this value, local
development uses `localStorage`, but the production site shows a shared database
configuration warning instead of saving different copies per device.

Create a Firebase Realtime Database and add this GitHub Actions repository
variable:

```bash
VITE_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
```

Optional GitHub Actions repository variable:

```bash
VITE_FIREBASE_DATA_PATH=bc-soccer-club
```

For a simple public board, Firebase rules can allow public reads and writes:

```json
{
  "rules": {
    "bc-soccer-club": {
      ".read": true,
      ".write": true
    }
  }
}
```

The staff password in the frontend is:

```text
Football11!
```

This is enough for a club signup board, but it is not strong security. A future
version should use real staff accounts before collecting sensitive information.
