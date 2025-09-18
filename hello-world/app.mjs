/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */

export const lambdaHandler = async (event, context) => {
    const expectedKey = process.env.API_KEY || '';
    const headers = event.headers || {};
    const provided = headers['x-api-key'] || headers['X-API-KEY'] || (headers['authorization'] && headers['authorization'].startsWith('Bearer ') ? headers['authorization'].slice(7) : '') || '';

    if (expectedKey && provided !== expectedKey) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    // Parse and validate JSON body
    let payload = null;
    try {
      if (!event.body) throw new Error('missing body');
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid JSON body', message: String(err) }) };
    }

    const errors = [];
    // Required fields
    const required = ['total_invested', 'total_value'];
    for (const key of required) {
      if (!(key in payload)) {
        errors.push(`missing required field: ${key}`);
      }
    }

    // Normalize and validate numeric fields
    const normalizeNumber = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
      return NaN;
    };

    const total_invested = normalizeNumber(payload.total_invested);
    const total_value = normalizeNumber(payload.total_value);
    const timestampRaw = payload.timestamp;
    const timestamp = timestampRaw === undefined || timestampRaw === null ? Math.floor(Date.now() / 1000) : normalizeNumber(timestampRaw);

    if (Number.isNaN(total_invested)) errors.push('total_invested must be a number');
    if (Number.isNaN(total_value)) errors.push('total_value must be a number');
    if (timestampRaw !== undefined && Number.isNaN(timestamp)) errors.push('timestamp must be a number when provided');

    if (errors.length > 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ errors }) };
    }

    const item = {
      total_invested,
      total_value,
      timestamp
    };

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'success', item }) };
  };
  