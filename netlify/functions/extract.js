exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const EXTEND_API_KEY = process.env.EXTEND_API_KEY;
  const EXTRACTOR_ID = 'Pd8CQZ9uVl8ona0jF7SGO';

  if (!EXTEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing EXTEND_API_KEY' }) };
  }

  let filename;
  try {
    ({ filename } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Build the public URL of the PDF hosted on Netlify
  const host = event.headers['x-forwarded-host'] || event.headers.host;
  const pdfUrl = `https://${host}/${filename}`;

  try {
    // Step 1: Create an extraction run
    const runRes = await fetch('https://api.extend.ai/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EXTEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extractor_id: EXTRACTOR_ID,
        document_url: pdfUrl,
      }),
    });

    if (!runRes.ok) {
      const err = await runRes.text();
      console.error('Extend run error:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'Extend API error', detail: err }) };
    }

    const runData = await runRes.json();

    // Step 2: Poll for result (Extend may be async)
    // If result already in response, return it
    if (runData.output) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(runData.output),
      };
    }

    // Otherwise poll
    const runId = runData.id || runData.run_id;
    if (!runId) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(runData) };
    }

    // Poll up to 30s
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.extend.ai/v1/extract/${runId}`, {
        headers: { 'Authorization': `Bearer ${EXTEND_API_KEY}` },
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'completed' || pollData.output) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(pollData.output || pollData),
        };
      }
      if (pollData.status === 'failed') {
        return { statusCode: 502, body: JSON.stringify({ error: 'Extraction failed' }) };
      }
    }

    return { statusCode: 504, body: JSON.stringify({ error: 'Extraction timed out' }) };

  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
