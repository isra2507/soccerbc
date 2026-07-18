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
2. Give that role permission to sync `s3://bcsoccerclub` and create invalidations for distribution `E2ROO7A769UCO2`.
3. In GitHub, add an Actions secret named `AWS_ROLE_ARN` with that role ARN.
4. In GitHub, add an Actions variable named `AWS_DEPLOY_ENABLED` with value `true`.

The deploy job stays skipped until `AWS_DEPLOY_ENABLED` is set to `true`.
