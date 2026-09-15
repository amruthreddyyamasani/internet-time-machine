const WAYBACK_TIMEMAP = 'https://web.archive.org/web/timemap/json';
const OUTPUT_HEADERS = ['timestamp', 'statuscode', 'mimetype', 'digest'];
const MAX_SNAPSHOTS = 2500;

export function getTimemapUrl(target) {
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('Invalid archive target.');
  }
  const params = new URLSearchParams({ url: target, filter: 'statuscode:200', collapse: 'digest', limit: String(MAX_SNAPSHOTS) });
  return `${WAYBACK_TIMEMAP}?${params.toString()}`;
}

export function normalizeTimemap(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) return [];
  const [headers, ...rawRows] = payload;
  const column = (name) => headers.indexOf(name);
  const timestampAt = column('timestamp');
  const statusAt = column('statuscode');
  const mimetypeAt = column('mimetype');
  const digestAt = column('digest');
  if ([timestampAt, statusAt, mimetypeAt, digestAt].some((index) => index < 0)) return [];
  const seen = new Set();
  return rawRows
    .filter((row) => Array.isArray(row) && /^\d{14}$/.test(row[timestampAt]) && row[statusAt] === '200' && !seen.has(row[digestAt]))
    .map((row) => {
      seen.add(row[digestAt]);
      return [row[timestampAt], row[statusAt], row[mimetypeAt] || '', row[digestAt] || ''];
    })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MAX_SNAPSHOTS);
}

export async function fetchCdx(target) {
  const response = await fetch(getTimemapUrl(target), {
    headers: { Accept: 'application/json', 'User-Agent': 'internet-time-machine/1.0' },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Archive responded with HTTP ${response.status}${body.includes('Temporarily Offline') ? ' (temporarily offline)' : ''}.`);
  }
  const payload = await response.json();
  return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify([OUTPUT_HEADERS, ...normalizeTimemap(payload)]) };
}

export async function handleCdxRequest(request, response) {
  const target = new URL(request.url, 'http://localhost').searchParams.get('url');
  if (!target) {
    response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Missing url query parameter.' }));
    return;
  }
  try {
    const result = await fetchCdx(target);
    response.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store' });
    response.end(result.body);
  } catch (error) {
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Wayback request failed.' }));
  }
}
