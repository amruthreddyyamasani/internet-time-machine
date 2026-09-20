# Internet Time Machine

A small experimental interface for exploring the recorded history of the web. Enter a URL, query real captures from the Internet Archive Wayback Machine, and travel through the snapshots that actually exist.

![Internet Time Machine interface](https://placehold.co/1600x900/08090a/79dbe8?text=Internet+Time+Machine)

## Why it exists

The web is constantly overwritten. Internet Time Machine treats the Wayback Machine like a navigable archive rather than a search result: the visual timeline, capture metadata, and snapshot transitions are designed to make the passage of time feel tangible.

## How it works

1. The app normalizes the URL entered by the user.
2. It requests capture data through a same-origin server-side proxy at `/api/wayback`, which calls the [Wayback Machine timemap JSON endpoint](https://web.archive.org/web/timemap/json) in historical decade, recent-year, and current-month windows, then normalizes and merges the real capture-index responses. This avoids browser CORS failures and the endpoint's forward-only limit while keeping the archive request public and keyless.
3. Only captures returned by the API are placed on the timeline. The app does not invent dates or historical results.
4. Selecting a capture opens its archived URL in an iframe where the browser and archive permit embedding.
5. If embedding is unavailable, the archived URL remains available through the **Open snapshot in new tab** link.

Each upstream query uses `statuscode:200`, `collapse=digest`, and a bounded `limit`. The client timeline groups captures by month so dense histories remain navigable while previous/next still moves through the complete chronological capture list. The normalized response keeps the existing CDX-shaped parser and UI contract.

The interface defaults to the system color scheme on a first visit, supports an explicit light/dark toggle, and persists the selection in `localStorage`.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/YOUR_USERNAME/internet-time-machine.git
cd internet-time-machine
npm install
npm run dev
```

Then open the local URL printed by Vite, usually `http://localhost:5173`.

To create a production build:

```bash
npm run build
npm run preview
```

## Project structure

```text
.
├── index.html          # Vite HTML entry point
├── package.json        # Scripts and minimal dependencies
├── public/             # Reserved for small static assets
├── api/
│   ├── cdx.js           # Vercel-compatible production proxy handler
│   └── wayback.js       # Production route alias
├── server/
│   └── cdxProxy.mjs     # Local Vite/preview proxy implementation
├── src/
│   ├── App.jsx         # UI, search flow, timeline, viewer, compare mode
│   ├── main.jsx        # React entry point
│   └── styles.css      # Responsive visual system and animations
└── README.md
```

## Limitations and honest edges

- The CDX API and archived content can be slow, unavailable, rate-limited, or incomplete.
- Some archived pages cannot render in an iframe because of `X-Frame-Options`, CSP, mixed content, JavaScript assumptions, or other browser security rules. Use **Open snapshot in new tab** for those captures.
- An archived page may load assets from different capture dates or fail to load some assets entirely. That is a limitation of the historical capture, not a fabricated replacement.
- The timeline displays unique successful CDX captures returned for the requested URL. It is not a complete record of every asset or every page on a domain.
- Wayback availability varies by URL. A valid website can legitimately return **NO ARCHIVED SNAPSHOTS FOUND**.
- The browser does not call Wayback directly. Local development and preview use the Vite middleware proxy; Vercel deployments use the `/api/wayback` serverless route. This avoids the CDX endpoint's browser CORS behavior and keeps upstream transport server-side.

## Design notes

The interface intentionally avoids a generic SaaS dashboard: near-black paper, off-white type, a restrained cyan archive signal, monospace metadata, scanline texture, and a horizontal instrument-like timeline create the feeling of a digital preservation lab.

## License

MIT. The Internet Archive and Wayback Machine are separate services with their own terms and policies; consult their documentation before operating this app at scale.
