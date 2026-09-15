const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';

// Wayback documents a default absolute maximum query result size of 150,000.
// We use one capture per day so the result remains practical for the browser.
const MAX_SNAPSHOTS = 150000;

const OUTPUT_HEADERS = ['timestamp', 'statuscode', 'mimetype', 'digest'];

function normalizeCdx(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) {
    return [];
  }

  const [headers, ...rawRows] = payload;

  const indexes = Object.fromEntries(
    OUTPUT_HEADERS.map((name) => [name, headers.indexOf(name)])
  );

  if (Object.values(indexes).some((index) => index < 0)) {
    return [];
  }

  const seen = new Set();

  return rawRows
    .filter(
      (row) =>
        Array.isArray(row) &&
        /^\d{14}$/.test(row[indexes.timestamp]) &&
        row[indexes.statuscode] === '200'
    )
    .map((row) => ({
      timestamp: row[indexes.timestamp],
      statuscode: row[indexes.statuscode],
      mimetype: row[indexes.mimetype] || '',
      digest: row[indexes.digest] || '',
    }))
    .filter((row) => {
      // Protect against duplicate timestamps/digests even if the upstream
      // response contains unexpected duplicate rows.
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

export default async function handler(request, response) {
  const target = request.query?.url;

  if (!target) {
    response.status(400).json({
      error: 'Missing url query parameter.',
    });
    return;
  }

  try {
    const parsed = new URL(target);

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname
    ) {
      throw new Error('Invalid archive target.');
    }

    const params = new URLSearchParams({
      url: target,

      // Only successful captures.
      filter: 'statuscode:200',

      // Keep the historical range broad while reducing extremely dense
      // captures to roughly one capture per day.
      collapse: 'timestamp:8',

      // Return the useful fields only.
      fl: OUTPUT_HEADERS.join(','),

      output: 'json',

      // Stay below Wayback's documented single-query maximum.
      limit: String(MAX_SNAPSHOTS),
    });

    const upstream = await fetch(
      `${WAYBACK_CDX}?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'internet-time-machine/1.0',
        },
      }
    );

    if (!upstream.ok) {
      const body = await upstream.text();

      throw new Error(
        `Archive responded with HTTP ${upstream.status}${
          body.includes('Temporarily Offline')
            ? ' (temporarily offline)'
            : ''
        }.`
      );
    }

    const payload = await upstream.json();
    const snapshots = normalizeCdx(payload);

    response
      .status(200)
      .setHeader(
        'content-type',
        'application/json; charset=utf-8'
      )
      .setHeader('cache-control', 'no-store')
      .send(
        JSON.stringify([
          OUTPUT_HEADERS,
          ...snapshots,
        ])
      );
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'Wayback request failed.',
    });
  }
}
