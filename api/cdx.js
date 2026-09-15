const WAYBACK_TIMEMAP = 'https://web.archive.org/web/timemap/json';
const MAX_SNAPSHOTS = 2500;

function normalizeTimemap(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) return [];
  const [headers, ...rawRows] = payload;
  const indexes = Object.fromEntries(['timestamp', 'statuscode', 'mimetype', 'digest'].map((name) => [name, headers.indexOf(name)]));
  if (Object.values(indexes).some((index) => index < 0)) return [];
  const seen = new Set();
  return rawRows
    .filter((row) => Array.isArray(row) && /^\d{14}$/.test(row[indexes.timestamp]) && row[indexes.statuscode] === '200' && !seen.has(row[indexes.digest]))
    .map((row) => {
      seen.add(row[indexes.digest]);
      return [row[indexes.timestamp], row[indexes.statuscode], row[indexes.mimetype] || '', row[indexes.digest] || ''];
    })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MAX_SNAPSHOTS);
}

export default async function handler(request, response) {
  const target = request.query?.url;
  if (!target) {
    response.status(400).json({ error: 'Missing url query parameter.' });
    return;
  }
  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Invalid archive target.');
    const params = new URLSearchParams({ url: target, filter: 'statuscode:200', collapse: 'digest', limit: String(MAX_SNAPSHOTS) });
    const upstream = await fetch(`${WAYBACK_TIMEMAP}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'internet-time-machine/1.0' },
    });
    if (!upstream.ok) throw new Error(`Archive responded with HTTP ${upstream.status}.`);
    const payload = await upstream.json();
    response.status(200).setHeader('content-type', 'application/json; charset=utf-8').setHeader('cache-control', 'no-store').send(JSON.stringify([['timestamp', 'statuscode', 'mimetype', 'digest'], ...normalizeTimemap(payload)]));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Wayback request failed.' });
  }
}
