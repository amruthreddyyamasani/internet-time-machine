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

function getTimemapUrl(target, from, to) {
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Invalid archive target.');
  const params = new URLSearchParams({ url: target, filter: 'statuscode:200', collapse: 'digest', limit: String(CAPTURES_PER_WINDOW), from, to });
  return `${WAYBACK_TIMEMAP}?${params.toString()}`;
}

function normalizeTimemap(payload) {
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
  const upstream = await fetch(getTimemapUrl(target, from, to), { headers: { Accept: 'application/json', 'User-Agent': 'internet-time-machine/1.0' } });
  if (!upstream.ok) throw new Error(`Archive responded with HTTP ${upstream.status}.`);
  return normalizeTimemap(await upstream.json());
}

export default async function handler(request, response) {
  const target = request.query?.url;
  if (!target) { response.status(400).json({ error: 'Missing url query parameter.' }); return; }
  try {
    const windows = await Promise.all(WINDOWS.map(([from, to]) => fetchWindow(target, from, to)));
    const seen = new Set();
    const rows = windows.flat().filter((row) => {
      const key = `${row[0]}:${row[3]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a[0].localeCompare(b[0]));
    response.status(200).setHeader('content-type', 'application/json; charset=utf-8').setHeader('cache-control', 'no-store').send(JSON.stringify([['timestamp', 'statuscode', 'mimetype', 'digest'], ...rows]));
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Wayback request failed.' });
  }
}
