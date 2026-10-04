# Atelier — Creative Portfolio & Studio Template

A full-stack, agency-quality portfolio template for creatives, artists, studios, and freelancers. Dark theme with coral accents, animated statistics, an interactive portfolio grid, a pictures-and-video gallery, and a complete blog CMS with an admin dashboard — **frontend and backend included**.

Built to be rebranded and resold: every headline, color, project, gallery item, stat, and blog post is editable from the admin panel with no code.

---

## What's inside

**Front-end (public site)**
- Dark, editorial design with a single coral accent (fully re-colorable)
- Animated hero with motion background, animated count-up statistics
- Interactive, filterable portfolio grid with hover reveals
- Gallery content hub for images **and** video, with a lightbox
- Blog / "Journal" with individual article pages
- Contact form that saves messages to the database
- Fully responsive, keyboard-accessible, reduced-motion friendly

**Back-end (real server + database)**
- Node.js + Express server
- SQLite database (zero configuration — a single file)
- Secure admin login (bcrypt-hashed passwords, JWT in an httpOnly cookie)
- REST API for posts, projects, gallery, stats, settings, and messages
- Image/video upload handling

**Admin dashboard** (`/admin`)
- Overview with live counts
- Rich-text blog editor (headings, bold, italic, lists, quotes, links, inline images)
- CRUD for portfolio projects, gallery items, and statistics
- Contact-message inbox
- Site Settings panel — rebrand the entire template (name, copy, socials, accent color)
- Change-password screen

---

## Quick start

You need [Node.js](https://nodejs.org) v18 or newer.

```bash
# 1. Install dependencies
npm install

# 2. (optional) configure environment
cp .env.example .env      # then edit the values

# 3. Start the server
npm start
```

Then open:

- **Site:**  http://localhost:4000
- **Admin:** http://localhost:4000/admin

**Default login:** `admin` / `admin123` — change it immediately under **Account** in the dashboard.

The database and placeholder content are created automatically on first run.

---

## Configuration (`.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | Port to run on (default `4000`) |
| `JWT_SECRET` | Secret for signing login sessions — **set a long random value in production** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | The admin account created on first run |
| `DB_PATH` | Optional custom path for the SQLite file |

---

## Rebranding it (for you or your customers)

Almost everything is editable from **Admin → Site Settings**: brand name, tagline, hero copy, about section, contact details, social links, and the accent color. Then use the **Portfolio**, **Gallery**, **Statistics**, and **Journal** tabs to replace the demo content with real work.

To reset the demo content at any time:

```bash
npm run seed        # force re-seed placeholder content
```

Placeholder images live in `public/assets/placeholders/` — replace them or upload your own through the admin panel.

---

## Adding video to the gallery

Gallery items can be `image` or `video`. For a video, set the **Type** to Video, upload or link an MP4 as the media file, and add a poster image. The public gallery shows the poster with a play button and opens the video in the lightbox.

---

## Lottie animations

The hero ships with a lightweight, dependency-free CSS/SVG motion background so it always renders. It's also Lottie-ready: drop a `hero.json` Lottie file into `public/assets/`, add the `lottie-web` script, and mount it into `#heroMotion` — a short snippet is documented at the top of `public/js/main.js`'s hero section.

---

## Project structure

```
atelier/
├─ server.js            # Express app entry
├─ db.js                # SQLite schema + placeholder seed
├─ lib/auth.js          # JWT / cookie auth helpers
├─ routes/
│  ├─ api.js            # public read API + contact form
│  └─ admin.js          # protected CRUD + login + uploads
├─ public/
│  ├─ index.html        # main portfolio page
│  ├─ post.html         # single blog article page
│  ├─ css/style.css     # site styles
│  ├─ js/main.js        # site logic
│  ├─ admin/            # admin dashboard SPA
│  ├─ assets/           # favicon, og image, placeholders
│  └─ uploads/          # user-uploaded media (created at runtime)
├─ data/                # SQLite database (created at runtime)
└─ .env.example
```

---

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). Set `NODE_ENV=production`, a strong `JWT_SECRET`, and a persistent disk for the `data/` and `public/uploads/` folders. Put it behind HTTPS so the secure login cookie is honored.

---

## Tech

Express · sql.js (pure-JS SQLite, no native build) · bcryptjs · jsonwebtoken · multer · vanilla JS (no front-end build step). Installs with zero build tools on any OS. MIT licensed — use it, rebrand it, sell it.
