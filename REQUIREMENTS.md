# investment-history-serverless — Requirements

This document captures high-level requirements for the investment-history-serverless project.

Functional requirements
- Accept POST requests to /history and record an investment snapshot.
- Validate incoming payloads contain the required fields: totalInvested, gainPercent, gainCurrency, totalCapital.
- Persist each recorad into a DynamoDB table named `InvestmentHistory` with partition key `date` (string YYYY-MM-DD) and sort key `timestamp` (number, unix seconds).
- Expose a single REST endpoint: POST /history.
- Return appropriate HTTP status codes: 200 on success, 400 for validation errors, 500 for internal errors.

Non-functional requirements
- Use AWS CloudFormation to define infrastructure as code.
- Lambda runtime: Node.js (nodejs20.x) — handler: `index.handler`.
- Least-privilege IAM: Lambda role should only allow `dynamodb:PutItem` on the `InvestmentHistory` table plus logging permissions.
- Use PAY_PER_REQUEST billing for DynamoDB.
- Template should be idempotent and safe to deploy multiple times.

Operational requirements
- Provide concise README with deployment steps (S3 upload and cloudformation deploy).
- Provide unit tests for the Lambda handler (mock DynamoDB).
- Provide basic troubleshooting steps and CloudFormation debugging tips.

Security & Compliance
- Do not log sensitive financial information.
- Use parameterised templates for environment-specific settings (bucket names, stack names).

Future enhancements
- Add GET endpoints to query history by date range.
- Add authorization (API key or IAM) for write operations.
- Add CI/CD pipeline for automated tests and deployment.
