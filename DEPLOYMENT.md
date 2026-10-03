# Deployment

This project deploys as a static Vite site through S3 and CloudFront.

## AWS Resources

- S3 bucket: `bcsoccerclub`
- S3 origin: `bcsoccerclub.s3.us-east-1.amazonaws.com`
- AWS region: `us-east-1`
- CloudFront distribution name: `bcsoccerclub`
- CloudFront distribution ID: `E2ROO7A769UCO2`
- CloudFront domain: `https://d35vcc3an9jffn.cloudfront.net`

## CloudFront Settings To Confirm

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

## Shared Roster Storage

The public CloudFront site uses an AWS API Gateway + Lambda + DynamoDB backend
so roster and match-date changes sync across phones, laptops, and other devices.

Current AWS backend resources:

- API Gateway invoke URL: `https://6oumqshk75.execute-api.us-east-1.amazonaws.com`
- Lambda function: `bcsoccerclub-api`
- DynamoDB table: `bcsoccerclub-state`
- DynamoDB partition key: `pk`
- Lambda environment variable: `TABLE_NAME=bcsoccerclub-state`

The frontend build uses `VITE_API_BASE_URL` from `.github/workflows/deploy.yml`.
The Lambda source is saved at `lambda/bcsoccerclub-api.mjs` and is deployed by
the GitHub Actions workflow before the static site. The Lambda environment must
contain:

- `TABLE_NAME=bcsoccerclub-state`
- `STAFF_PASSWORD_HASH` in `pbkdf2-sha256$iterations$saltBase64$hashBase64` format
- `STAFF_AUTH_SECRET` with at least 32 random bytes

The API Gateway CORS configuration must allow the `Authorization` and
`Content-Type` request headers so signed staff requests reach Lambda. API
Gateway must also route `POST /auth` to the `bcsoccerclub-api` Lambda.

Until the GitHub role has `lambda:UpdateFunctionCode` and
`lambda:UpdateFunctionConfiguration`, the workflow continues with the static
site deployment and the frontend uses hashed local password verification for
compatibility with the current API. Add those permissions to activate signed
server-side staff sessions on the next deployment.
