# Internet Time Machine

A small experimental interface for exploring the recorded history of the web. Enter a URL, query real captures from the Internet Archive Wayback Machine, and travel through the snapshots that actually exist.

![Internet Time Machine interface](https://placehold.co/1600x900/08090a/79dbe8?text=Internet+Time+Machine)

## Why it exists

The web is constantly overwritten. Internet Time Machine treats the Wayback Machine like a navigable archive rather than a search result: the visual timeline, capture metadata, and snapshot transitions are designed to make the passage of time feel tangible.

## How it works

1. The app normalizes the URL entered by the user.
2. It requests capture data from the [Wayback Machine CDX API](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server).
3. Only captures returned by the API are placed on the timeline. The app does not invent dates or historical results.
4. Selecting a capture opens its archived URL in an iframe where the browser and archive permit embedding.
5. If embedding is unavailable, the archived URL remains available through the **Open snapshot in new tab** link.

The query uses `statuscode:200` and `collapse=digest` to keep the experience focused on unique, successfully captured responses rather than repeating identical captures.

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
- This is a client-only app. The browser calls the public CDX endpoint directly, so production deployments should consider a small proxy if the archive's CORS or rate-limit policy changes.

## Design notes

The interface intentionally avoids a generic SaaS dashboard: near-black paper, off-white type, a restrained cyan archive signal, monospace metadata, scanline texture, and a horizontal instrument-like timeline create the feeling of a digital preservation lab.

## License

MIT. The Internet Archive and Wayback Machine are separate services with their own terms and policies; consult their documentation before operating this app at scale.

