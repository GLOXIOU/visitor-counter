# Visitor Counter

Visitor Counter is a lightweight, self-hosted web analytics tool — a privacy-friendly alternative to Google Analytics.
Track visits, time on page, scroll depth, clicks, forms, sections, videos and click heatmaps across multiple websites, all from your own dashboard.

---

## ✨ Features

- **Visits**: page views, unique visitors, live visitors, active time on page, scroll depth, bounce rate
- **Audience**: sources (Google, LinkedIn, social networks, AI assistants…), UTM campaigns, devices, browsers, OS, languages, countries and cities (map)
- **Actions**: clicks on links and buttons, outbound links, e-mail / phone links, downloads, form submissions, sections seen, video / audio plays, copied text, printing
- **Click heatmap**: open any page with an overlay of where visitors clicked (desktop / tablet / mobile)
- **Automatic instrumentation**: drop your website (one HTML file, several files, a folder or a `.zip`) and get it back with the tracking script and the tracking attributes already added everywhere
- **Dashboard**: periods (24 h → all time), comparison with the previous period, filter by page, recent visits, CSV export
- **Bot filtering**, optional password protection, light / dark theme

---

## 🛡️ GDPR Compliance

Visitor Counter is designed to be **GDPR-friendly**.
It does **not** set cookies on your visitors' browsers: a random identifier is kept in `localStorage` only to count unique visitors. IP addresses are anonymized (last part removed) before being stored, and only the approximate city is kept for geolocation.
Typed form values are never read. All data stays on your own server.

> ⚠️ Important: Always provide a short privacy notice on your site describing the data collected.

Your own visits can be excluded on a device by opening your site with `#vc-notrack` at the end of the URL (`#vc-track` to undo).

---

## ⚙️ Installation

```bash
git clone https://github.com/GLOXIOU/visitor-counter.git
cd visitor-counter
npm install
npm start
```

Then open http://localhost:3000 (Node.js 20.12 or newer).

### Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | *(empty)* | Protects the dashboard with a password. Strongly recommended in production, since the tag code is visible in your site's source |
| `PUBLIC_URL` | current address | Public URL of the server, used in the snippets (e.g. `https://stats.example.com`) |
| `GEOIP` | `on` | `off` disables geolocation (ip-api.com, then ipwho.is as fallback) |
| `STATS_TZ` | `Europe/Paris` | Time zone used for charts |
| `RETENTION_DAYS` | `365` | How long visits are kept |
| `TRUST_PROXY` | `true` | Express `trust proxy` setting (keep `true` behind a reverse proxy) |
| `DATA_DIR` | `./data` | Where the data files are stored |

See `.env.example`.

---

## 🧩 Usage

1. On the homepage, **create a tag** (one per website). A unique code is generated.
2. Install it on your site, either:
   - **automatically**: click **Baliser un site**, choose the tag and drop your site (HTML file, folder or `.zip`). The script is added to the `<head>` of every page and tracking attributes are added to links, buttons, forms, sections and videos. Download the result and upload it to your hosting. Everything happens in your browser: files are never sent to the server.
   - **manually**: copy the snippet and paste it into the `<head>` of every page:
     ```html
     <script defer src="https://your-server/tag.js?tag=YOUR_CODE"></script>
     ```
3. Open the tag's **Dashboard**.

Links and buttons are tracked automatically, even without attributes (including the ones created in JavaScript). The attributes give them clear names and enable section, form and media tracking.

### Tracking attributes

| Attribute | Effect |
| --- | --- |
| `data-track="Name"` | Counts clicks on the element under this name |
| `data-track-view="Name"` | Counts visitors who saw this area on screen |
| `data-track-form="Name"` | Counts form submissions |
| `data-track-media="Name"` | Counts video / audio plays and completions |
| `data-no-track` | Ignores the element |

Custom events from your own JavaScript:

```js
VisitorCounter.track('Newsletter signup');
```

### Heatmap

In the dashboard, the 🔥 button of a page opens it with the click heatmap overlay (the link is valid for 2 hours and the visit is not counted).

---

## 🗂️ Project structure

```
server.js              Express server
lib/                   storage, collection, statistics, geolocation, authentication
routes/                admin API (/api/balise) and public collection (/tag.js, /api/collect, /api/heatmap)
tracker/tag.js         script loaded by the tracked websites
public/                dashboard, tag list, instrumentation tool, login page
data/                  one JSON file per tag (created automatically)
```

---

## 🧑‍💻 Contributing

Pull requests and feature suggestions are welcome!
Feel free to open an issue to discuss improvements.

---

## 🧾 License

© GLOXIOU 2026
