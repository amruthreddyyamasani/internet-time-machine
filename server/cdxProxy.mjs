const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';
const OUTPUT_HEADERS = ['timestamp', 'statuscode', 'mimetype', 'digest'];
const MAX_SNAPSHOTS = 150000;

export function getCdxUrl(target) {
  const parsed = new URL(target);

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !parsed.hostname
  ) {
    throw new Error('Invalid archive target.');
  }

  const params = new URLSearchParams({
    url: target,
    filter: 'statuscode:200',
    collapse: 'timestamp:8',
    fl: OUTPUT_HEADERS.join(','),
    output: 'json',
    limit: String(MAX_SNAPSHOTS),
  });

  return `${WAYBACK_CDX}?${params.toString()}`;
}

export function normalizeCdx(payload) {
  if (
    !Array.isArray(payload) ||
    payload.length < 2 ||
    !Array.isArray(payload[0])
  ) {
    return [];
  }

  const [headers, ...rawRows] = payload;

  const column = (name) => headers.indexOf(name);

  const timestampAt = column('timestamp');
  const statusAt = column('statuscode');
  const mimetypeAt = column('mimetype');
  const digestAt = column('digest');

  if (
    [timestampAt, statusAt, mimetypeAt, digestAt].some(
      (index) => index < 0
    )
  ) {
    return [];
  }

  const seen = new Set();

  return rawRows
    .filter(
      (row) =>
        Array.isArray(row) &&
        /^\d{14}$/.test(row[timestampAt]) &&
        row[statusAt] === '200'
    )
    .map((row) => ({
      timestamp: row[timestampAt],
      statuscode: row[statusAt],
      mimetype: row[mimetypeAt] || '',
      digest: row[digestAt] || '',
    }))
    .filter((row) => {
      const key = `${row.timestamp}-${row.digest}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((row) => [
      row.timestamp,
      row.statuscode,
      row.mimetype,
      row.digest,
    ])
    .slice(0, MAX_SNAPSHOTS);
}

export async function fetchCdx(target) {
  const response = await fetch(getCdxUrl(target), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'internet-time-machine/1.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Archive responded with HTTP ${response.status}${
        body.includes('Temporarily Offline')
          ? ' (temporarily offline)'
          : ''
      }.`
    );
  }

  const payload = await response.json();
  const snapshots = normalizeCdx(payload);

  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify([
      OUTPUT_HEADERS,
      ...snapshots,
    ]),
  };
}

export async function handleCdxRequest(request, response) {
  const target = new URL(
    request.url,
    'http://localhost'
  ).searchParams.get('url');

  if (!target) {
    response.writeHead(400, {
      'content-type': 'application/json; charset=utf-8',
    });

    response.end(
      JSON.stringify({
        error: 'Missing url query parameter.',
      })
    );

    return;
  }

  try {
    const result = await fetchCdx(target);

    response.writeHead(result.status, {
      'content-type': result.contentType,
      'cache-control': 'no-store',
    });

    response.end(result.body);
  } catch (error) {
    response.writeHead(502, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });

    response.end(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'Wayback request failed.',
      })
    );
  }
}
