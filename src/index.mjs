import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' }));

export const lambdaHandler = async (event, context) => {
  console.log('DEBUG incoming event:', JSON.stringify(event));
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

    // Persist to DynamoDB: single UpdateItem that writes the values and returns the new item
    const table = process.env.TABLE_NAME;

    const params = {
      TableName: table,
      Key: { timestamp },
      UpdateExpression: 'SET total_invested = :ti, total_value = :tv',
      ExpressionAttributeValues: { ':ti': total_invested, ':tv': total_value },
      ReturnValues: 'ALL_NEW'
    };

    try {
      const res = await ddbClient.send(new UpdateCommand(params));
      const saved = res.Attributes;
      console.log('DEBUG saved item:', JSON.stringify(saved));
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'success', item: saved }) };
    } catch (err) {
      console.error('ERROR during DynamoDB update', err && err.stack ? err.stack : err);
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'dynamodb_error', message: String(err) }) };
    }
  };
  