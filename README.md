# BC Soccer Club

Public React + Vite site for soccer player signup, automatic balancing across
two to four teams, staff team management, and a next-match countdown.

## Run locally

```bash
npm install
npm run dev
```

The app works locally with `localStorage` if no database is configured.

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
