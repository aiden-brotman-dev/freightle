exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const EXTEND_API_KEY = process.env.EXTEND_API_KEY;
  const EXTRACTOR_ID = 'ex_Pd8CQZ9uVl8ona0jF7SGO';

  if (!EXTEND_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing EXTEND_API_KEY' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const headers = {
    'Authorization': `Bearer ${EXTEND_API_KEY}`,
    'Content-Type': 'application/json',
    'x-extend-api-version': '2026-02-09',
  };

  // MODE 1: Start a new extraction run
  if (body.filename) {
    const host = event.headers['x-forwarded-host'] || event.headers['host'];
    const encoded = body.filename.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    const pdfUrl = `https://${host}/${encoded}`;

    const res = await fetch('https://api.extend.ai/v1/extract_runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        extractor: { id: EXTRACTOR_ID },
        file: { url: pdfUrl },
      }),
    });

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ runId: data.id, status: data.status }),
    };
  }

  // MODE 2: Poll for result
  if (body.runId) {
    const res = await fetch(`https://api.extend.ai/v1/extract_runs/${body.runId}`, { headers });
    const data = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: data.status,
        output: data.output || null,
      }),
    };
  }

  return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing filename or runId' }) };
};
