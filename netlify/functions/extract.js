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
      body: JSON.stringify({ error: 'Missing EXTEND_API_KEY environment variable' }),
    };
  }

  let filename;
  try {
    ({ filename } = JSON.parse(event.body));
  } catch {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  // Build the public URL of the PDF
  const host = event.headers['x-forwarded-host'] || event.headers['host'];
  const proto = 'https';
  const encodedFilename = filename.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  const pdfUrl = `${proto}://${host}/${encodedFilename}`;

  console.log('Calling Extend with PDF URL:', pdfUrl);
  console.log('Extractor ID:', EXTRACTOR_ID);

  try {
    const res = await fetch('https://api.extend.ai/v1/extract_runs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EXTEND_API_KEY}`,
        'Content-Type': 'application/json',
        'x-extend-api-version': '2026-02-09',
      },
      body: JSON.stringify({
        extractor: { id: EXTRACTOR_ID },
        file: { url: pdfUrl },
      }),
    });

    const responseText = await res.text();
    console.log('Extend response status:', res.status);
    console.log('Extend response body:', responseText);

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Extend API error', status: res.status, detail: responseText }),
      };
    }

    const data = JSON.parse(responseText);

    // If already complete
    if (data.status === 'completed' && data.output) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data.output),
      };
    }

    // Poll for completion
    const runId = data.id;
    if (!runId) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      };
    }

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const pollRes = await fetch(`https://api.extend.ai/v1/extract_runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${EXTEND_API_KEY}`,
          'x-extend-api-version': '2026-02-09',
        },
      });

      const pollText = await pollRes.text();
      console.log(`Poll ${i+1} status:`, pollRes.status, pollText.slice(0, 200));

      const pollData = JSON.parse(pollText);

      if (pollData.status === 'completed' && pollData.output) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(pollData.output),
        };
      }

      if (pollData.status === 'failed') {
        return {
          statusCode: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Extraction failed', detail: pollData }),
        };
      }
    }

    return {
      statusCode: 504,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Extraction timed out after 40 seconds' }),
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
