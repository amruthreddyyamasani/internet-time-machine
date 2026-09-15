import { useEffect, useMemo, useRef, useState } from 'react';

const WAYBACK = 'https://web.archive.org';
const DEFAULT_URL = 'https://example.com';

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a website URL to begin.');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname || !parsed.hostname.includes('.')) throw new Error('Enter a valid website URL, such as example.com.');
  return parsed.href;
}

function snapshotUrl(snapshot, target) {
  return `${WAYBACK}/web/${snapshot.timestamp}/${target}`;
}

function formatDate(timestamp, options = {}) {
  const date = new Date(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...options }).format(date);
}

function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`));
}

function formatTime(timestamp) {
  return `${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)} UTC`;
}

function parseRows(payload) {
  if (!Array.isArray(payload) || payload.length < 2) return [];
  const [headers, ...rows] = payload;
  return rows.filter((row) => Array.isArray(row)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))).filter((row) => /^\d{14}$/.test(row.timestamp));
}

export default function App() {
  const [url, setUrl] = useState('');
  const [searchedUrl, setSearchedUrl] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('INPUT ERROR');
  const [iframeError, setIframeError] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const timelineRef = useRef(null);

  const selected = snapshots[selectedIndex];
  const compare = compareIndex === null ? null : snapshots[compareIndex];
  const domain = useMemo(() => {
    try { return new URL(searchedUrl).hostname.replace(/^www\./, '').toUpperCase(); } catch { return 'ARCHIVE TARGET'; }
  }, [searchedUrl]);

  async function searchArchive(event) {
    event?.preventDefault();
    setError('');
    setErrorTitle('INPUT ERROR');
    setIframeError(false);
    let target;
    try { target = normalizeUrl(url); } catch (err) { setStatus('error'); setErrorTitle('INPUT ERROR'); setError(err.message); return; }
    setUrl(target);
    setStatus('searching');
    setSnapshots([]);
    setCompareIndex(null);
    try {
      const endpoint = `${WAYBACK}/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&fl=timestamp,statuscode,mimetype,digest&filter=statuscode:200&collapse=digest&limit=10000`;
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Archive responded with HTTP ${response.status}.`);
      const rows = parseRows(await response.json());
      if (!rows.length) {
        setStatus('empty');
        setSearchedUrl(target);
        return;
      }
      setSearchedUrl(target);
      setSnapshots(rows);
      setSelectedIndex(rows.length - 1);
      setStatus('ready');
      window.setTimeout(() => document.querySelector('.archive-desk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (err) {
      setStatus('error');
      setErrorTitle('ARCHIVE UNAVAILABLE');
      setError(err instanceof TypeError ? 'The archive could not be reached. Check your connection and try again.' : err.message);
    }
  }

  function selectSnapshot(index) {
    setIframeError(false);
    setSelectedIndex(index);
  }

  function scrollTimeline(amount) {
    timelineRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!selected) return;
    setIframeError(false);
  }, [selected]);

  const timelineYears = useMemo(() => [...new Set(snapshots.map((item) => item.timestamp.slice(0, 4)))], [snapshots]);

  return (
    <main className="app-shell">
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Internet Time Machine home">ITM<span>/</span>01</a>
        <div className="topbar-meta"><span className={`status-dot ${status === 'searching' ? 'is-searching' : status === 'error' ? 'is-error' : ''}`} />{status === 'searching' ? 'SEARCHING ARCHIVE' : status === 'error' ? 'ARCHIVE UNAVAILABLE' : 'ARCHIVE CONNECTED'}<span className="topbar-separator">/</span>WAYBACK MACHINE</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-kicker"><span className="crosshair">＋</span> AN EXPERIMENTAL WEB ARCHIVE INTERFACE <span className="hero-line" /></div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">THE INTERNET, RECORDED</p>
            <h1>INTERNET<br /><em>TIME MACHINE</em></h1>
          </div>
          <div className="hero-aside">
            <p>Explore how the web looked before it became what it is today.</p>
            <div className="aside-index">— 001<br />A MACHINE FOR REMEMBERING</div>
          </div>
        </div>
        <form className="search-form" onSubmit={searchArchive}>
          <label htmlFor="url">ENTER A URL TO BEGIN</label>
          <div className="search-row">
            <span className="protocol">URL://</span>
            <input id="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com" autoComplete="url" spellCheck="false" />
            <button type="submit" disabled={status === 'searching'}>{status === 'searching' ? 'SEARCHING…' : 'ENTER ARCHIVE'} <span>↗</span></button>
          </div>
          <div className="form-foot"><span>WAYBACK MACHINE / HISTORICAL WEB ARCHIVE</span><span>HTTPS PREFERRED</span></div>
        </form>
        {status === 'error' && <div className="message error-message"><strong>{errorTitle}</strong><span>{error}</span></div>}
        {status === 'empty' && <div className="message empty-message"><strong>NO ARCHIVED SNAPSHOTS FOUND</strong><span>The archive returned no captures for {searchedUrl}. Try the root domain or another URL.</span></div>}
      </section>

      {status === 'searching' && <section className="loading-state"><span className="loading-bar" /><span>QUERYING THE ARCHIVE…</span></section>}

      {snapshots.length > 0 && <section className="archive-desk" aria-label="Archive results">
        <div className="section-heading"><div><p className="eyebrow">ARCHIVE TARGET</p><h2>{domain}</h2></div><div className="result-count"><span>{snapshots.length.toLocaleString()}</span> UNIQUE CAPTURES<br />RETURNED BY CDX</div></div>
        <div className="timeline-wrap">
          <button className="timeline-arrow left" onClick={() => scrollTimeline(-280)} aria-label="Scroll timeline left">←</button>
          <div className="timeline-scroller" ref={timelineRef}>
            <div className="timeline-years">{timelineYears.map((year) => <span key={year}>{year}</span>)}</div>
            <div className="timeline-track"><span className="track-line" />{snapshots.map((item, index) => <button key={`${item.timestamp}-${item.digest}`} className={`timeline-point ${index === selectedIndex ? 'selected' : ''}`} style={{ left: `${snapshots.length === 1 ? 50 : (index / (snapshots.length - 1)) * 100}%` }} onClick={() => selectSnapshot(index)} title={`${formatShortDate(item.timestamp)} · ${formatTime(item.timestamp)}`}><span className="point-dot" /><span className="point-label">{item.timestamp.slice(0, 4)}</span></button>)}</div>
          </div>
          <button className="timeline-arrow right" onClick={() => scrollTimeline(280)} aria-label="Scroll timeline right">→</button>
        </div>
        <div className="timeline-note"><span>DRAG / SCROLL TO TRAVEL THROUGH TIME</span><span>{selectedIndex + 1} / {snapshots.length}</span></div>

        <div className="snapshot-layout">
          <aside className="snapshot-info">
            <p className="eyebrow">ARCHIVED SNAPSHOT</p>
            <h3>{domain}</h3>
            <div className="snapshot-date">{formatDate(selected.timestamp)}</div>
            <div className="snapshot-time">{formatTime(selected.timestamp)}</div>
            <p className="travel-copy">YOU ARE VIEWING THE WEB<br />AS IT EXISTED <strong>{new Date().getUTCFullYear() - Number(selected.timestamp.slice(0, 4))} YEARS AGO.</strong></p>
            <dl className="metadata"><div><dt>CAPTURE</dt><dd>{selected.timestamp.slice(0, 4)}-{selected.timestamp.slice(4, 6)}-{selected.timestamp.slice(6, 8)}</dd></div><div><dt>TIME</dt><dd>{formatTime(selected.timestamp)}</dd></div><div><dt>SOURCE</dt><dd>INTERNET ARCHIVE</dd></div></dl>
            <div className="nav-controls"><button onClick={() => selectSnapshot(Math.max(0, selectedIndex - 1))} disabled={selectedIndex === 0}>← PREVIOUS</button><button onClick={() => selectSnapshot(Math.min(snapshots.length - 1, selectedIndex + 1))} disabled={selectedIndex === snapshots.length - 1}>NEXT →</button></div>
            <a className="open-link" href={snapshotUrl(selected, searchedUrl)} target="_blank" rel="noreferrer">OPEN SNAPSHOT IN NEW TAB ↗</a>
          </aside>
          <div className={`viewer ${iframeError ? 'viewer-fallback' : ''}`}>
            {iframeError ? <div className="fallback"><span className="fallback-mark">⊘</span><p>THIS ARCHIVE CANNOT<br />BE EMBEDDED.</p><a href={snapshotUrl(selected, searchedUrl)} target="_blank" rel="noreferrer">OPEN SNAPSHOT ↗</a></div> : <><div className="viewer-chrome"><span>WAYBACK / {selected.timestamp}</span><span>LIVE FRAME</span></div><iframe title={`Archived snapshot of ${domain} from ${formatDate(selected.timestamp)}`} src={snapshotUrl(selected, searchedUrl)} onError={() => setIframeError(true)} /></>}
          </div>
        </div>

        <div className="compare-section">
          <div className="compare-header"><div><p className="eyebrow">OPTIONAL VIEW</p><h3>COMPARE MOMENTS</h3></div><button className={`compare-toggle ${showCompare ? 'active' : ''}`} onClick={() => setShowCompare(!showCompare)}>{showCompare ? 'CLOSE COMPARE' : 'COMPARE'} <span>＋</span></button></div>
          {showCompare && <div className="compare-controls"><label>BEFORE<select value={compareIndex ?? Math.max(0, selectedIndex - 1)} onChange={(event) => setCompareIndex(Number(event.target.value))}>{snapshots.map((item, index) => <option key={item.timestamp} value={index}>{formatShortDate(item.timestamp)}</option>)}</select></label><span className="versus">VS</span><div className="compare-selected"><span>AFTER</span><strong>{formatShortDate(selected.timestamp)}</strong></div></div>}
          {showCompare && compare && <div className="compare-grid"><div className="compare-frame"><div className="compare-label">BEFORE / {formatShortDate(compare.timestamp)}</div><iframe title={`Before snapshot of ${domain}`} src={snapshotUrl(compare, searchedUrl)} /></div><div className="compare-frame"><div className="compare-label">AFTER / {formatShortDate(selected.timestamp)}</div><iframe title={`After snapshot of ${domain}`} src={snapshotUrl(selected, searchedUrl)} /></div></div>}
        </div>
      </section>}

      <footer className="footer"><div><span className="footer-mark">ITM<span>/</span>01</span><p>A small instrument for exploring<br />the recorded history of the web.</p></div><div className="footer-right"><span>DATA PROVIDED BY</span><strong>THE INTERNET ARCHIVE</strong><span>NO HISTORICAL DATA IS INVENTED.</span></div></footer>
    </main>
  );
}
