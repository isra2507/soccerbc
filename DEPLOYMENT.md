# Deployment

This project deploys as a static Vite site through S3 and CloudFront.

## AWS Resources

- S3 bucket: `bcsoccerclub`
- S3 origin: `bcsoccerclub.s3.us-east-1.amazonaws.com`
- AWS region: `us-east-1`
- CloudFront distribution name: `bcsoccerclub`
- CloudFront distribution ID: `E2ROO7A769UCO2`
- Website: `https://www.bcsoccerclub.com` (the apex `bcsoccerclub.com` should redirect to it)
- CloudFront domain: `https://d35vcc3an9jffn.cloudfront.net`

## CloudFront Settings To Confirm

- Alternate domain names (CNAMEs): `www.bcsoccerclub.com` (and `bcsoccerclub.com` if it
  is served), with an ACM certificate issued in `us-east-1` that covers them
- Default root object: `index.html`
- Origin access: CloudFront Origin Access Control enabled
- S3 bucket public access: blocked
- Custom error response for `403`: return `/index.html` with response code `200`
- Custom error response for `404`: return `/index.html` with response code `200`

At the time these notes were created, the CloudFront distribution was still deploying and the default root object was blank.

## GitHub Actions Setup

The workflow at `.github/workflows/deploy.yml` builds the app, uploads `dist/` to S3, and invalidates CloudFront whenever `main` is pushed.

Before enabling automatic deploys:

1. Create an AWS IAM role trusted by GitHub OIDC for `repo:isra2507/soccerbc:ref:refs/heads/main`.
2. Give that role permission to sync `s3://bcsoccerclub`, create invalidations for distribution `E2ROO7A769UCO2`, and update the `bcsoccerclub-api` Lambda code and configuration.
3. In GitHub, add an Actions secret named `AWS_ROLE_ARN` with that role ARN.
4. Run `npm run hash-password` locally, then add its output as a `STAFF_PASSWORD_HASH` Actions secret.
5. Add a `STAFF_AUTH_SECRET` Actions secret containing at least 32 random bytes. For example, generate one with `openssl rand -base64 48`.
6. In GitHub, add an Actions variable named `AWS_DEPLOY_ENABLED` with value `true`.

The deploy job stays skipped until `AWS_DEPLOY_ENABLED` is set to `true`.

## API (API Gateway + Lambda + DynamoDB)

- API Gateway invoke URL: `https://6oumqshk75.execute-api.us-east-1.amazonaws.com`
- Lambda function: `bcsoccerclub-api` (handler `index.handler`)
- DynamoDB table: `bcsoccerclub-state`, partition key `pk` (string)

The Lambda is built from `api/lambda.ts` with `npm run build:api` (esbuild →
`dist-api/index.mjs`) and deployed by the workflow. Its environment:

- `TABLE_NAME=bcsoccerclub-state`
- `STAFF_PASSWORD_HASH` in `pbkdf2-sha256$iterations$saltBase64$hashBase64` format
- `STAFF_AUTH_SECRET` with at least 32 random bytes
- `ALLOWED_ORIGINS`, a comma-separated list of browser origins allowed by CORS
  (set by the workflow; no wildcard). It must include the real site,
  `https://www.bcsoccerclub.com`, or browsers will block every API call. An origin is
  scheme + host exactly, so `bcsoccerclub.com` and `www.bcsoccerclub.com` are different.

The Lambda role needs `dynamodb:GetItem`, `PutItem` and `UpdateItem` on the table.
Enable DynamoDB TTL on the attribute `expiresAt` so rate-limit counters expire.
API Gateway must route `GET /state`, `POST /auth`, `POST /players`,
`PATCH|DELETE /players/{id}`, `POST /rebalance`, `PUT /match`,
`PUT /match/announcement` and `PUT /captains/{team}` to the Lambda (a `$default`
route does this). If API Gateway has its own CORS configuration enabled it
overrides the Lambda's headers, so set its allowed origins to match `ALLOWED_ORIGINS`
and allow the methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`.

Rate limits (per client IP): `/auth` 10 attempts / 15 min, sign-up 30 / 10 min.
If the counter write fails the limiter fails open and logs an error.

The GitHub role must have `lambda:UpdateFunctionCode` and
`lambda:UpdateFunctionConfiguration`; the deploy fails if the Lambda step fails.

## Migrating the existing data (one time, before the first deploy of this version)

The new code stores the game under `pk = GAME#current`; the old code used
`pk = state`. They live side by side in the same table and the old item is never
modified or deleted, so the migration can be rehearsed and rolled back.

```bash
# needs AWS credentials for the account; use the same region as the table
npm run migrate -- --table bcsoccerclub-state --dry-run     # shows what would be written
npm run migrate -- --table bcsoccerclub-state --backup state-backup.json
```

Run it just before deploying (changes made on the old site after the migration
would not be carried over). Running it again does nothing. To roll back, redeploy
the previous Lambda and site; the old `state` item is untouched.

## Local development

`npm run dev:api` starts DynamoDB Local (Docker) and the API on port 3001;
`npm run dev` serves the site against it. `npm test` also runs against DynamoDB
Local when it is up (CI requires it).

## Infrastructure as code (`template.yml`)

`template.yml` (AWS SAM) describes everything in one stack: a private S3 bucket,
CloudFront (site, plus the API under `/api` on the same domain so CORS is not involved),
the HTTP API and Lambda, the DynamoDB table (TTL on `expiresAt`, point-in-time
recovery, never deleted with the stack), log retention, and CloudWatch alarms that email
`AlertEmail`. The existing hand-made resources are **not** imported; the stack creates new
ones, so move over in this order:

1. Request an ACM certificate for `www.bcsoccerclub.com` and `bcsoccerclub.com` **in
   us-east-1** (CloudFront requires that region whatever region the stack is in) and
   validate it.
2. Build and deploy the stack (pick the region on purpose; `us-west-2` is closest to
   Bellevue):
   ```bash
   npm run build:api
   sam deploy --region us-west-2 --parameter-overrides \
     StaffPasswordHash='...' StaffAuthSecret='...' OriginVerifySecret="$(openssl rand -base64 48)" \
     CertificateArn=arn:aws:acm:us-east-1:... \
     AlertEmail=you@example.com            # add HostedZoneId=... if the domain is in Route 53
   ```
3. Copy the data into the new table (safe to rehearse; `--dry-run` writes nothing):
   ```bash
   npm run migrate -- --source-table bcsoccerclub-state --source-region us-east-1 \
     --table <TableName output> --region us-west-2 --backup state-backup.json
   ```
4. Build the site for the stack and upload it:
   ```bash
   VITE_API_BASE_URL=/api npm run build
   aws s3 sync dist/ s3://<SiteBucketName output> --delete
   aws cloudfront create-invalidation --distribution-id <DistributionId output> --paths "/*"
   ```
5. Check the site on the `DistributionDomain` output (sign up, staff login, move a player).
   Also confirm the direct `ApiEndpoint` answers `403` (it must: only CloudFront may call the
   API), and, after a few failed logins from your own phone and laptop, that each is limited
   separately. The rate limit reads the visitor's address from `x-forwarded-for`
   (see `clientIp` in `api/http.ts`); that header's exact shape behind CloudFront and API
   Gateway is the one assumption not testable outside AWS, so look at a real request once.
6. Point DNS for the domain at `DistributionDomain` (automatic if `HostedZoneId` was given),
   leave the old stack running for a day, then delete it.

The GitHub deploy workflow still targets the old hand-made resources; switching it to
`sam deploy` plus the two upload commands above is the remaining wiring.
`npm run validate:infra` lints the template and runs in CI.

Deliberately absent: CloudFront "custom error responses" that send 404s to `index.html`.
They would rewrite the API's own 404s (for example "Player not found") into HTML. The site
uses hash routes, so every page is the one `index.html`.

## Pipelines: only what changed runs

Both workflows decide what a change touches with `scripts/changed-areas.ts` (rules and
tests in `test/changed-areas.test.ts`):

| Changed files | Deploys | CI runs |
|---|---|---|
| `src/**`, `public/**`, `index.html`, `vite.config.js` | the site only | checks, site build, e2e |
| `api/**` | the Lambda only | checks, API build, e2e |
| `shared/**`, `package.json`, `package-lock.json`, `tsconfig.json` | both | everything above |
| `template.yml`, `samconfig.toml` | nothing yet (see below) | template validation |
| `test/**`, `e2e/**`, `scripts/**`, lint config | nothing | checks, e2e |
| `.github/**` | nothing | everything |
| docs and README only | nothing | nothing |

**Deploy** (`.github/workflows/deploy.yml`, on push to `main`): the API job runs first and the
site job only after it succeeded or was skipped, so a new site never meets an old API. Deploys
never overlap (`concurrency: deploy`). To deploy by hand (Actions, Run workflow) choose
`api`, `web` or `both`; this ignores what changed. Nothing runs unless the repository variable
`AWS_DEPLOY_ENABLED` is `true`.

**CI** (`.github/workflows/ci.yml`): skipped jobs are normal. In the repository's branch
protection, require only the single check named **CI result**; it passes when everything that
ran passed (and when nothing needed to run) and fails if any job failed.

Not covered: `template.yml` changes are validated but not deployed, because the pipeline still
targets the hand-made resources. When the stack takes over, add a third deploy job for
`infra` that runs `sam deploy`.
