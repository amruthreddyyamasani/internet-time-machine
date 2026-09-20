const WAYBACK_TIMEMAP = 'https://web.archive.org/web/timemap/json';
const CAPTURES_PER_WINDOW = 2500;
const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_MONTH = new Date().getUTCMonth() + 1;
const WINDOWS = [
  ['1990', '1999'],
  ['2000', '2009'],
  ['2010', '2019'],
  ['2020', '2024'],
  ['2025', '2025'],
  ...Array.from({ length: CURRENT_MONTH }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return [`${CURRENT_YEAR}${month}`, `${CURRENT_YEAR}${month}`];
  }),
];

export function getTimemapUrl(target, from, to) {
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Invalid archive target.');
  const params = new URLSearchParams({ url: target, filter: 'statuscode:200', collapse: 'digest', limit: String(CAPTURES_PER_WINDOW), from, to });
  return `${WAYBACK_TIMEMAP}?${params.toString()}`;
}

export function normalizeTimemap(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) return [];
  const [headers, ...rawRows] = payload;
  const indexes = Object.fromEntries(['timestamp', 'statuscode', 'mimetype', 'digest'].map((name) => [name, headers.indexOf(name)]));
  if (Object.values(indexes).some((index) => index < 0)) return [];
  const seen = new Set();
  return rawRows.filter((row) => Array.isArray(row) && /^\d{14}$/.test(row[indexes.timestamp]) && row[indexes.statuscode] === '200' && !seen.has(row[indexes.digest])).map((row) => {
    seen.add(row[indexes.digest]);
    return [row[indexes.timestamp], row[indexes.statuscode], row[indexes.mimetype] || '', row[indexes.digest] || ''];
  });
}

async function fetchWindow(target, from, to) {
  const response = await fetch(getTimemapUrl(target, from, to), { headers: { Accept: 'application/json', 'User-Agent': 'internet-time-machine/1.0' } });
  if (!response.ok) throw new Error(`Archive responded with HTTP ${response.status}.`);
  return normalizeTimemap(await response.json());
}

export async function fetchCdx(target) {
  const windows = await Promise.all(WINDOWS.map(([from, to]) => fetchWindow(target, from, to)));
  const seen = new Set();
  const rows = windows.flat().filter((row) => {
    const key = `${row[0]}:${row[3]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a[0].localeCompare(b[0]));
  return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify([['timestamp', 'statuscode', 'mimetype', 'digest'], ...rows]) };
}

export async function handleCdxRequest(request, response) {
  const target = new URL(request.url, 'http://localhost').searchParams.get('url');
  if (!target) { response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: 'Missing url query parameter.' })); return; }
  try {
    const result = await fetchCdx(target);
    response.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store' });
    response.end(result.body);
  } catch (error) {
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Wayback request failed.' }));
  }
}
