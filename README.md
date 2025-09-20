# Investment History Service

## Description

A serverless investment history API built with AWS Lambda, API Gateway, and DynamoDB. This service provides secure storage and retrieval of investment portfolio data with API key authentication and rate limiting.

### Architecture

- **AWS Lambda** (Node.js 22.x) - Serverless compute for API logic
- **API Gateway REST API** - HTTP endpoint with API key enforcement
- **DynamoDB** - NoSQL database for investment records
- **CloudWatch** - Logging and monitoring

### Features

- **API Key Authentication** - Secure access with x-api-key header
- **Rate Limiting** - Per-key daily quotas (100/day test, 1000/day prod)
- **Multi-Environment** - Separate test and prod deployments
- **Data Validation** - Input validation with 2-decimal precision
- **Error Handling** - Comprehensive error responses

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed
- Node.js 18+ installed

### Build and Deploy

```bash
# Build the application
sam build

# Deploy to test environment
sam deploy --config-env test

# Deploy to production environment
sam deploy --config-env prod
```

### Environment Configuration

Each environment creates isolated resources:

| Environment | Stack Name | DynamoDB Table | Daily Quota |
|-------------|------------|----------------|-------------|
| test | `investment-history-service-test` | `investment-history-test` | 100 |
| prod | `investment-history-service-prod` | `investment-history-prod` | 1000 |

### Getting Your API Key

After deployment, retrieve your API key:

```bash
# Get API key ID from CloudFormation stack outputs
aws cloudformation describe-stacks \
  --stack-name investment-history-service-prod \
  --query "Stacks[0].Outputs[?OutputKey=='ApiKeyId'].OutputValue" \
  --output text

# Get the API key value (replace YOUR_KEY_ID with the actual ID)
aws apigateway get-api-key \
  --api-key YOUR_KEY_ID \
  --include-value \
  --query "value" \
  --output text
```

## API Documentation

### Base URLs

- **Test Environment**: `https://[api-id].execute-api.us-west-2.amazonaws.com/test`
- **Production Environment**: `https://[api-id].execute-api.us-west-2.amazonaws.com/prod`

### Authentication

All API requests require an API key in the request header:

```http
x-api-key: your-api-key-here
```

### Endpoints

#### POST /accountHistoryLog

Records investment portfolio data to the database.

**Request:**

```http
POST /accountHistoryLog
Content-Type: application/json
x-api-key: your-api-key-here

{
  "total_invested": 1000.50,
  "total_value": 1250.75,
  "timestamp": 1640995200
}
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `total_invested` | number | Yes | Total amount invested (rounded to 2 decimal places) |
| `total_value` | number | Yes | Current portfolio value (rounded to 2 decimal places) |
| `timestamp` | number | No | Unix timestamp (defaults to current time if not provided) |

**Response (Success - 200):**

```json
{
  "message": "success",
  "item": {
    "timestamp": 1640995200,
    "total_invested": 1000.50,
    "total_value": 1250.75
  }
}
```

**Response (Error - 400):**

```json
{
  "errors": [
    "missing required field: total_invested"
  ]
}
```

**Response (Error - 401):**

```json
{
  "error": "Unauthorized"
}
```

**Response (Error - 429):**

```json
{
  "message": "Too Many Requests"
}
```

### Rate Limits

- **Test Environment**: 100 requests per day per API key
- **Production Environment**: 1000 requests per day per API key

### Testing

```bash
# Test with curl
curl -X POST \
  https://your-api-endpoint/prod/accountHistoryLog \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: your-api-key' \
  -d '{
    "total_invested": 1000.00,
    "total_value": 1200.50
  }'
```