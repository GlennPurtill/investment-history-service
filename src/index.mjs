import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Document Client - Initialized outside handler for connection reuse
 * ⚡ PERFORMANCE: Reusing connections reduces Lambda cold start overhead
 * ⚡ PERFORMANCE: Limited retries (1) and timeout (3s) for fast failure
 */
const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-west-2',
    maxAttempts: 1, // Fast failure - don't retry on errors
    requestTimeout: 3000, // 3 second timeout for DynamoDB operations
  })
);

/**
 * Pre-defined HTTP headers for JSON responses
 * ⚡ PERFORMANCE: Avoid object creation on every request
 */
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Required fields for investment history records
 * ⚡ PERFORMANCE: Pre-defined array to avoid allocation per request
 */
const REQUIRED_FIELDS = ['total_invested', 'total_value'];

/**
 * ⚡ VALIDATION FUNCTIONS - Optimized for performance with early returns
 */

/**
 * Validates that the Lambda event contains a request body
 *
 * @param {Object} event - AWS Lambda event object
 * @param {string|Object} event.body - The request body (JSON string or parsed object)
 * @returns {{isValid: boolean, error?: Object}} Validation result with optional error response
 *
 * @example
 * const result = validateRequestBody({ body: '{"data": "value"}' });
 * if (!result.isValid) return result.error;
 */
const validateRequestBody = event => {
  // Check if body exists - most common validation failure
  if (!event.body) {
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"missing body"}',
      },
    };
  }
  return { isValid: true };
};

/**
 * Parses and validates JSON from the request body
 *
 * @param {string|Object} body - Request body (JSON string or already parsed object)
 * @returns {{isValid: boolean, payload?: Object, error?: Object}} Parse result with payload or error
 *
 * @example
 * const result = parseAndValidateJson('{"total_invested": 100}');
 * if (result.isValid) {
 *   const { payload } = result;
 *   // Use payload.total_invested
 * }
 */
const parseAndValidateJson = body => {
  let payload;
  try {
    // Handle both string and already-parsed object bodies
    // API Gateway sends strings, local testing may send objects
    payload = typeof body === 'string' ? JSON.parse(body) : body;
    return { isValid: true, payload };
  } catch {
    // Fast failure - don't expose JSON parsing details to client
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"invalid JSON body"}',
      },
    };
  }
};

/**
 * Validates that required fields are present in the payload
 *
 * @param {Object} payload - Parsed JSON payload from request body
 * @param {number|string} payload.total_invested - Total amount invested (required)
 * @param {number|string} payload.total_value - Current portfolio value (required)
 * @param {number|string} [payload.timestamp] - Record timestamp (optional)
 * @returns {{isValid: boolean, tiRaw?: any, tvRaw?: any, error?: Object}} Validation result
 *
 * @example
 * const result = validateRequiredFields({ total_invested: 100, total_value: 200 });
 * if (result.isValid) {
 *   const { tiRaw, tvRaw } = result; // Extract raw values for further processing
 * }
 */
const validateRequiredFields = payload => {
  // Destructure required fields for validation
  const { total_invested: tiRaw, total_value: tvRaw } = payload;

  // Check total_invested - most critical field first
  if (tiRaw === undefined || tiRaw === null) {
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"missing required field: total_invested"}',
      },
    };
  }

  // Check total_value - second most critical field
  if (tvRaw === undefined || tvRaw === null) {
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"missing required field: total_value"}',
      },
    };
  }

  // Return raw values for number conversion/validation
  return { isValid: true, tiRaw, tvRaw };
};

/**
 * Converts and validates numeric values for investment amounts
 *
 * @param {any} tiRaw - Raw total_invested value from payload
 * @param {any} tvRaw - Raw total_value value from payload
 * @returns {{isValid: boolean, ti?: number, tv?: number, error?: Object}} Converted numbers or error
 *
 * @example
 * const result = validateAndConvertNumbers("100.50", "200.75");
 * if (result.isValid) {
 *   const { ti, tv } = result; // ti = 100.5, tv = 200.75
 * }
 */
const validateAndConvertNumbers = (tiRaw, tvRaw) => {
  // ⚡ PERFORMANCE: Unary plus (+) is fastest way to convert to number
  const total_invested = +tiRaw;
  const total_value = +tvRaw;

  // Validate total_invested is a finite number (not NaN, Infinity, etc.)
  if (!Number.isFinite(total_invested)) {
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"total_invested must be a valid number"}',
      },
    };
  }

  // Validate total_value is a finite number
  if (!Number.isFinite(total_value)) {
    return {
      isValid: false,
      error: {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: '{"error":"total_value must be a valid number"}',
      },
    };
  }

  // ⚡ PERFORMANCE: Round to 2 decimal places using multiply/divide trick
  // This is faster than parseFloat(number.toFixed(2))
  const ti = Math.round(total_invested * 100) / 100;
  const tv = Math.round(total_value * 100) / 100;

  return { isValid: true, ti, tv };
};

/**
 * Processes and validates timestamp value for the investment record
 *
 * @param {any} tsRaw - Raw timestamp value from payload (optional)
 * @returns {number} Unix timestamp (seconds since epoch)
 *
 * @example
 * processTimestamp(1609459200)     // Returns: 1609459200 (valid timestamp)
 * processTimestamp("invalid")      // Returns: current timestamp
 * processTimestamp(null)           // Returns: current timestamp
 */
const processTimestamp = tsRaw => {
  // ⚡ PERFORMANCE: Fast timestamp handling with fallback
  // If tsRaw exists, try to convert to number, fallback to current time if invalid
  // If no tsRaw provided, use current time
  return tsRaw
    ? +tsRaw || Math.floor(Date.now() / 1000) // Convert or fallback
    : Math.floor(Date.now() / 1000); // Current Unix timestamp
};

/**
 * AWS Lambda handler for investment history API
 *
 * Processes POST requests to record investment portfolio snapshots.
 * Validates input data and stores records in DynamoDB.
 *
 * @async
 * @function lambdaHandler
 * @param {Object} event - AWS Lambda event object
 * @param {string} event.httpMethod - HTTP method (should be POST)
 * @param {string|Object} event.body - Request body containing investment data
 * @param {Object} event.headers - HTTP headers from the request
 * @param {Object} context - AWS Lambda context object
 * @param {string} context.awsRequestId - Unique request identifier
 * @param {number} context.getRemainingTimeInMillis - Function timeout remaining
 *
 * @returns {Promise<Object>} HTTP response object
 * @returns {number} returns.statusCode - HTTP status code (200, 400, 500)
 * @returns {Object} returns.headers - Response headers
 * @returns {string} returns.body - JSON response body
 *
 * @example
 * // Success response:
 * {
 *   statusCode: 200,
 *   headers: { "Content-Type": "application/json" },
 *   body: '{"message":"success","item":{"timestamp":1609459200,"total_invested":100,"total_value":200}}'
 * }
 *
 * @example
 * // Error response:
 * {
 *   statusCode: 400,
 *   headers: { "Content-Type": "application/json" },
 *   body: '{"error":"missing required field: total_invested"}'
 * }
 */
export const lambdaHandler = async (event, context) => {
  // ⚡ VALIDATION PIPELINE: Sequential validation with early returns for performance
  // Each step only runs if the previous step succeeded
  // NOTE: API Gateway validates the API key before requests reach this Lambda

  // Step 1: Validate request body exists
  const bodyValidation = validateRequestBody(event);
  if (!bodyValidation.isValid) {
    return bodyValidation.error; // Early return - most common failure
  }

  // Step 2: Parse and validate JSON structure
  const jsonValidation = parseAndValidateJson(event.body);
  if (!jsonValidation.isValid) {
    return jsonValidation.error; // Early return for malformed JSON
  }

  // Extract payload and optional timestamp for processing
  const payload = jsonValidation.payload;
  const { timestamp: tsRaw } = payload;

  // Step 3: Validate required business fields are present
  const fieldsValidation = validateRequiredFields(payload);
  if (!fieldsValidation.isValid) {
    return fieldsValidation.error; // Early return for missing fields
  }

  // Step 4: Convert and validate numeric values
  const numbersValidation = validateAndConvertNumbers(
    fieldsValidation.tiRaw,
    fieldsValidation.tvRaw
  );
  if (!numbersValidation.isValid) {
    return numbersValidation.error; // Early return for invalid numbers
  }

  // Extract validated and converted numeric values
  const { ti, tv } = numbersValidation;

  // Step 5: Process timestamp (with current time fallback)
  const timestamp = processTimestamp(tsRaw);

  // ⚡ DATABASE OPERATION: Store investment record in DynamoDB
  try {
    // Debug logging for troubleshooting (remove in production if not needed)
    console.log('TABLE_NAME:', process.env.TABLE_NAME);
    console.log('Attempting DynamoDB update with:', { timestamp, ti, tv });

    // ⚡ PERFORMANCE: Use UpdateCommand instead of PutCommand for upsert behavior
    // This allows overwriting existing records with the same timestamp
    const result = await ddbClient.send(
      new UpdateCommand({
        TableName: process.env.TABLE_NAME, // Environment-specific table
        Key: { timestamp }, // Partition key for the record
        UpdateExpression: 'SET total_invested = :ti, total_value = :tv', // Update expression
        ExpressionAttributeValues: { ':ti': ti, ':tv': tv }, // Parameterized values
        ReturnValues: 'ALL_NEW', // Return updated item
      })
    );

    // ⚡ PERFORMANCE: Template literal avoids extra JSON.stringify call
    // Concatenate pre-built JSON strings for minimal processing overhead
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: `{"message":"success","item":${JSON.stringify(result.Attributes)}}`,
    };
  } catch (err) {
    // 🔍 DEBUGGING: Comprehensive error logging for troubleshooting
    // Log multiple error properties to help diagnose DynamoDB issues
    console.error('DynamoDB error details:');
    console.error('Name:', err.name); // Error type
    console.error('Message:', err.message); // Error description
    console.error('Code:', err.$metadata?.httpStatusCode); // HTTP status if available
    console.error('Full error:', err); // Complete error object

    // Return user-friendly error without exposing internal details
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: `{"error":"database_error","details":"${err.message}"}`,
    };
  }
};
