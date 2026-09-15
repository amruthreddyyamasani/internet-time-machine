import { useEffect, useMemo, useRef, useState } from 'react';

const WAYBACK = 'https://web.archive.org';

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a website URL to begin.');

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new Error('Enter a valid website URL, such as example.com.');
  }

  return parsed.href;
}

function snapshotUrl(snapshot, target) {
  if (!snapshot || !snapshot.timestamp) return '#';
  return `${WAYBACK}/web/${snapshot.timestamp}/${target}`;
}

function toDate(timestamp) {
  if (!timestamp || timestamp.length < 14) return new Date();
  return new Date(
    Date.UTC(
      Number(timestamp.slice(0, 4)),
      Number(timestamp.slice(4, 6)) - 1,
      Number(timestamp.slice(6, 8)),
      Number(timestamp.slice(8, 10)),
      Number(timestamp.slice(10, 12)),
      Number(timestamp.slice(12, 14))
    )
  );
}

function formatDate(timestamp, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(toDate(timestamp));
}

function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toDate(timestamp));
}

function formatTime(timestamp) {
  if (!timestamp || timestamp.length < 14) return '00:00:00 UTC';
  return `${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)} UTC`;
}

function parseRows(payload) {
  if (!Array.isArray(payload) || payload.length < 2) return [];

  const [headers, ...rows] = payload;
  const timestampIndex = headers.indexOf('timestamp');

  return rows
    .filter(
      (row) =>
        Array.isArray(row) &&
        timestampIndex >= 0 &&
        /^\d{14}$/.test(row[timestampIndex])
    )
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ''])
      )
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';

  const saved = localStorage.getItem('itm-theme');

  if (saved === 'light' || saved === 'dark') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export default function App() {
  const [url, setUrl] = useState('');
  const [searchedUrl, setSearchedUrl] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('INPUT ERROR');
  const [iframeError, setIframeError] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [machineActive, setMachineActive] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [scrollProgress, setScrollProgress] = useState(0);

  const timelineRef = useRef(null);
  const heroRef = useRef(null);

  const selected = snapshots[selectedIndex] || null;
  const compare = snapshots[compareIndex] || null;

  const domain = useMemo(() => {
    try {
      return new URL(searchedUrl).hostname
        .replace(/^www\./, '')
        .toUpperCase();
    } catch {
      return 'ARCHIVE TARGET';
    }
  }, [searchedUrl]);

  const timelineYears = useMemo(
    () => [...new Set(snapshots.map((item) => item.timestamp.slice(0, 4)))],
    [snapshots]
  );

  const earliest = snapshots[0];
  const latest = snapshots[snapshots.length - 1];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('itm-theme', theme);
  }, [theme]);

  useEffect(() => {
    const move = (event) => {
      if (window.matchMedia('(pointer: coarse)').matches) return;

      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;

      setCursor({ x, y });
    };

    window.addEventListener('pointermove', move, { passive: true });

    return () => window.removeEventListener('pointermove', move);
  }, []);

  useEffect(() => {
    const updateScroll = () => {
      const max =
        document.documentElement.scrollHeight - window.innerHeight;

      setScrollProgress(max > 0 ? window.scrollY / max : 0);
    };

    window.addEventListener('scroll', updateScroll, { passive: true });

    updateScroll();

    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  useEffect(() => {
    if (!heroRef.current) return;

    heroRef.current.style.setProperty('--mx', `${cursor.x}`);
    heroRef.current.style.setProperty('--my', `${cursor.y}`);
  }, [cursor]);

  async function searchArchive(event) {
    event?.preventDefault();

    setError('');
    setErrorTitle('INPUT ERROR');
    setIframeError(false);

    let target;

    try {
      target = normalizeUrl(url);
    } catch (err) {
      setStatus('error');
      setErrorTitle('INPUT ERROR');
      setError(err.message);
      return;
    }

    setUrl(target);
    setStatus('searching');
    setSnapshots([]);
    setMachineActive(true);

    try {
      // Direct Wayback CDX API Fallback if backend proxy endpoint isn't defined
      const endpoint = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
        target
      )}&output=json&fl=timestamp,original,digest&filter=statuscode:200&collapse=timestamp:8`;

      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Archive responded with HTTP ${response.status}.`);
      }

      const rows = parseRows(await response.json());

      if (!rows.length) {
        setStatus('empty');
        setSearchedUrl(target);
        setMachineActive(false);
        return;
      }

      setSearchedUrl(target);
      setSnapshots(rows);
      setSelectedIndex(rows.length - 1);
      setCompareIndex(Math.max(0, rows.length - 2));
      setStatus('ready');

      window.setTimeout(() => {
        document.querySelector('.archive-desk')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });

        setMachineActive(false);
      }, 650);
    } catch (err) {
      setStatus('error');
      setErrorTitle('ARCHIVE UNAVAILABLE');

      setError(
        err instanceof TypeError
          ? 'The archive could not be reached. Check your connection and try again.'
          : err.message
      );

      setMachineActive(false);
    }
  }

  function selectSnapshot(index) {
    setIframeError(false);
    setSelectedIndex(index);
    if (compareIndex === index) {
      setCompareIndex(Math.max(0, index - 1));
    }
  }

  function scrollTimeline(amount) {
    timelineRef.current?.scrollBy({
      left: amount,
      behavior: 'smooth',
    });
  }

  function jumpToYear(year) {
    const index = snapshots.findIndex(
      (snapshot) => snapshot.timestamp.slice(0, 4) === year
    );

    if (index >= 0) {
      selectSnapshot(index);

      document.querySelector('.snapshot-layout')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  useEffect(() => {
    if (!selected) return;
    setIframeError(false);
  }, [selected]);

  return (
    <main className={`app-shell ${machineActive ? 'machine-active' : ''}`}>
      <div
        className="scroll-progress"
        style={{ transform: `scaleX(${scrollProgress})` }}
      />

      <div className="noise" aria-hidden="true" />

      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="ambient ambient-three" aria-hidden="true" />

      <header className="topbar">
        <a
          className="wordmark"
          href="#top"
          aria-label="Internet Time Machine home"
        >
          ITM<span>/</span>01
        </a>

        <div className="topbar-actions">
          <div className="topbar-meta">
            <span
              className={`status-dot ${
                status === 'searching'
                  ? 'is-searching'
                  : status === 'error'
                    ? 'is-error'
                    : ''
              }`}
            />

            {status === 'searching'
              ? 'SEARCHING ARCHIVE'
              : status === 'error'
                ? 'ARCHIVE UNAVAILABLE'
                : 'ARCHIVE CONNECTED'}

            <span className="topbar-separator">/</span>

            WAYBACK MACHINE
          </div>

          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setTheme((current) =>
                current === 'dark' ? 'light' : 'dark'
              )
            }
            aria-label={`Switch to ${
              theme === 'dark' ? 'light' : 'dark'
            } mode`}
          >
            <span>{theme === 'dark' ? '☼' : '◐'}</span>
            {theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
        </div>
      </header>

      <section className="hero" id="top" ref={heroRef}>
        <div className="hero-grid-system" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="time-orbit orbit-back" aria-hidden="true">
          <div className="orbit-ring ring-a" />
          <div className="orbit-ring ring-b" />
          <div className="orbit-ring ring-c" />

          <div className="orbit-core">
            <span>WEB</span>
            <strong>∞</strong>
          </div>

          <i className="orbit-dot dot-a">1996</i>
          <i className="orbit-dot dot-b">2008</i>
          <i className="orbit-dot dot-c">2026</i>
        </div>

        <div className="hero-kicker">
          <span className="crosshair">＋</span>
          AN EXPERIMENTAL WEB ARCHIVE INTERFACE
          <span className="hero-line" />
          <span className="hero-index">001 / 001</span>
        </div>

        <div className="hero-grid">
          <div className="hero-title-wrap">
            <p className="eyebrow hero-eyebrow">
              THE INTERNET, RECORDED
            </p>

            <h1>
              INTERNET
              <br />
              <em>TIME MACHINE</em>
            </h1>

            <div className="title-coordinate">
              <span>LAT 00° / WEB</span>
              <span>CHRONOLOGICAL INTERFACE</span>
            </div>
          </div>

          <div className="hero-aside">
            <div className="aside-number">T−∞</div>

            <p>
              Explore how the web looked before it became what it is today.
            </p>

            <div className="aside-index">
              — 001
              <br />
              A MACHINE FOR REMEMBERING
            </div>
          </div>
        </div>

        <div className="machine-dial" aria-hidden="true">
          <div className="dial-line" />
          <span>PAST</span>
          <span>PRESENT</span>
          <span>FUTURE</span>
        </div>

        <form className="search-form" onSubmit={searchArchive}>
          <label htmlFor="url">ENTER A URL TO BEGIN</label>

          <div className="search-row">
            <span className="protocol">URL://</span>

            <input
              id="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com"
              autoComplete="url"
              spellCheck="false"
            />

            <button type="submit" disabled={status === 'searching'}>
              <span>
                {status === 'searching'
                  ? 'QUERYING…'
                  : 'ENTER ARCHIVE'}
              </span>
              <b>↗</b>
            </button>
          </div>

          <div className="form-foot">
            <span>WAYBACK MACHINE / HISTORICAL WEB ARCHIVE</span>
            <span>HTTPS PREFERRED</span>
          </div>
        </form>

        {status === 'searching' && (
          <div className="machine-sequence" aria-live="polite">
            <span className="sequence-pulse" />
            <span>
              CONNECTING → QUERYING → RECONSTRUCTING
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="message error-message">
            <strong>{errorTitle}</strong>
            <span>{error}</span>
          </div>
        )}

        {status === 'empty' && (
          <div className="message empty-message">
            <strong>NO ARCHIVED SNAPSHOTS FOUND</strong>

            <span>
              The archive returned no captures for {searchedUrl}. Try the
              root domain or another URL.
            </span>
          </div>
        )}

        <div className="scroll-cue" aria-hidden="true">
          <span>SCROLL TO TRAVEL</span>
          <i />
        </div>
      </section>

      {status === 'searching' && (
        <section className="loading-state">
          <span className="loading-bar" />
          <span>QUERYING THE ARCHIVE…</span>
        </section>
      )}

      {snapshots.length > 0 && selected && (
        <section className="archive-desk" aria-label="Archive results">
          <div className="section-reveal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ARCHIVE TARGET</p>
                <h2>{domain}</h2>
              </div>

              <div className="result-count">
                <span>{snapshots.length.toLocaleString()}</span>{' '}
                DAILY CAPTURES
                <br />
                RETURNED BY CDX
              </div>
            </div>

            <div className="history-summary">
              <div>
                <span>EARLIEST</span>
                <strong>{formatShortDate(earliest.timestamp)}</strong>
              </div>

              <div className="history-range">
                <span>HISTORICAL RANGE</span>
                <strong>
                  {earliest.timestamp.slice(0, 4)} —{' '}
                  {latest.timestamp.slice(0, 4)}
                </strong>
              </div>

              <div>
                <span>LATEST</span>
                <strong>{formatShortDate(latest.timestamp)}</strong>
              </div>
            </div>
          </div>

          <div className="year-jump">
            {timelineYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => jumpToYear(year)}
              >
                {year}
              </button>
            ))}
          </div>

          <div className="timeline-wrap">
            <button
              className="timeline-arrow left"
              type="button"
              onClick={() => scrollTimeline(-420)}
              aria-label="Scroll timeline left"
            >
              ←
            </button>

            <div className="timeline-scroller" ref={timelineRef}>
              <div className="timeline-years">
                {timelineYears.map((year) => (
                  <span key={year}>{year}</span>
                ))}
              </div>

              <div className="timeline-track">
                <span className="track-line" />

                {snapshots.map((item, index) => (
                  <button
                    key={`${item.timestamp}-${index}`}
                    className={`timeline-point ${
                      index === selectedIndex ? 'selected' : ''
                    }`}
                    style={{
                      left: `${
                        snapshots.length === 1
                          ? 50
                          : (index / (snapshots.length - 1)) * 100
                      }%`,
                    }}
                    onClick={() => selectSnapshot(index)}
                    title={`${formatShortDate(
                      item.timestamp
                    )} · ${formatTime(item.timestamp)}`}
                    type="button"
                  >
                    <span className="point-halo" />
                    <span className="point-dot" />
                    <span className="point-label">
                      {item.timestamp.slice(0, 4)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              className="timeline-arrow right"
              type="button"
              onClick={() => scrollTimeline(420)}
              aria-label="Scroll timeline right"
            >
              →
            </button>
          </div>

          <div className="timeline-note">
            <span>DRAG / SCROLL TO TRAVEL THROUGH TIME</span>
            <span>
              {selectedIndex + 1} / {snapshots.length}
            </span>
          </div>

          <div className="snapshot-layout">
            <aside className="snapshot-info">
              <div className="snapshot-index">
                CAPTURE / {String(selectedIndex + 1).padStart(4, '0')}
              </div>

              <p className="eyebrow">ARCHIVED SNAPSHOT</p>

              <h3>{domain}</h3>

              <div className="snapshot-date">
                {formatDate(selected.timestamp)}
              </div>

              <div className="snapshot-time">
                {formatTime(selected.timestamp)}
              </div>

              <p className="travel-copy">
                YOU ARE VIEWING THE WEB
                <br />
                AS IT EXISTED{' '}
                <strong>
                  {Math.max(
                    0,
                    new Date().getUTCFullYear() -
                      Number(selected.timestamp.slice(0, 4))
                  )}{' '}
                  YEARS AGO.
                </strong>
              </p>

              <dl className="metadata">
                <div>
                  <dt>CAPTURE</dt>
                  <dd>
                    {selected.timestamp.slice(0, 4)}-
                    {selected.timestamp.slice(4, 6)}-
                    {selected.timestamp.slice(6, 8)}
                  </dd>
                </div>

                <div>
                  <dt>TIME</dt>
                  <dd>{formatTime(selected.timestamp)}</dd>
                </div>

                <div>
                  <dt>SOURCE</dt>
                  <dd>INTERNET ARCHIVE</dd>
                </div>
              </dl>

              <div className="nav-controls">
                <button
                  type="button"
                  onClick={() =>
                    selectSnapshot(Math.max(0, selectedIndex - 1))
                  }
                  disabled={selectedIndex === 0}
                >
                  ← PREVIOUS
                </button>

                <button
                  type="button"
                  onClick={() =>
                    selectSnapshot(
                      Math.min(
                        snapshots.length - 1,
                        selectedIndex + 1
                      )
                    )
                  }
                  disabled={selectedIndex === snapshots.length - 1}
                >
                  NEXT →
                </button>
              </div>

              <a
                className="open-link"
                href={snapshotUrl(selected, searchedUrl)}
                target="_blank"
                rel="noreferrer"
              >
                OPEN SNAPSHOT IN NEW TAB ↗
              </a>
            </aside>

            <div
              className={`viewer ${
                iframeError ? 'viewer-fallback' : ''
              }`}
            >
              <div className="viewer-depth depth-one" />
              <div className="viewer-depth depth-two" />

              {iframeError ? (
                <div className="fallback">
                  <span className="fallback-mark">⊘</span>

                  <p>
                    THIS ARCHIVE CANNOT
                    <br />
                    BE EMBEDDED.
                  </p>

                  <a
                    href={snapshotUrl(selected, searchedUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OPEN SNAPSHOT ↗
                  </a>
                </div>
              ) : (
                <>
                  <div className="viewer-chrome">
                    <span>
                      WAYBACK / {selected.timestamp}
                    </span>

                    <span>LIVE FRAME</span>
                  </div>

                  <iframe
                    title={`Archived snapshot of ${domain} from ${formatDate(
                      selected.timestamp
                    )}`}
                    src={snapshotUrl(selected, searchedUrl)}
                    onError={() => setIframeError(true)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="compare-section">
            <div className="compare-header">
              <div>
                <p className="eyebrow">OPTIONAL VIEW</p>
                <h3>COMPARE MOMENTS</h3>
              </div>

              <button
                className={`compare-toggle ${
                  showCompare ? 'active' : ''
                }`}
                type="button"
                onClick={() => setShowCompare(!showCompare)}
              >
                {showCompare ? 'CLOSE COMPARE' : 'COMPARE'}{' '}
                <span>＋</span>
              </button>
            </div>

            {showCompare && (
              <div className="compare-controls">
                <label>
                  BEFORE
                  <select
                    value={compareIndex}
                    onChange={(event) =>
                      setCompareIndex(Number(event.target.value))
                    }
                  >
                    {snapshots.map((item, index) => (
                      <option
                        key={`${item.timestamp}-${index}`}
                        value={index}
                      >
                        {formatShortDate(item.timestamp)}
                      </option>
                    ))}
                  </select>
                </label>

                <span className="versus">VS</span>

                <div className="compare-selected">
                  <span>AFTER</span>
                  <strong>
                    {formatShortDate(selected.timestamp)}
                  </strong>
                </div>
              </div>
            )}

            {showCompare && compare && (
              <div className="compare-grid">
                <div className="compare-frame">
                  <div className="compare-label">
                    BEFORE / {formatShortDate(compare.timestamp)}
                  </div>

                  <iframe
                    title={`Before snapshot of ${domain}`}
                    src={snapshotUrl(compare, searchedUrl)}
                  />
                </div>

                <div className="compare-frame">
                  <div className="compare-label">
                    AFTER / {formatShortDate(selected.timestamp)}
                  </div>

                  <iframe
                    title={`After snapshot of ${domain}`}
                    src={snapshotUrl(selected, searchedUrl)}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="footer">
        <div>
          <span className="footer-mark">
            ITM<span>/</span>01
          </span>

          <p>
            A small instrument for exploring
            <br />
            the recorded history of the web.
          </p>
        </div>

        <div className="footer-right">
          <span>DATA PROVIDED BY</span>
          <strong>THE INTERNET ARCHIVE</strong>
          <span>NO HISTORICAL DATA IS INVENTED.</span>
        </div>
      </footer>
    </main>
  );
}