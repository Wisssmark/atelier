# Deploying Atelier

## Before you deploy — required

1. **Set `JWT_SECRET`** — generate one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. **Set a strong `ADMIN_PASSWORD`** (or change it right after first login).
3. **Set `NODE_ENV=production`** — enables secure cookies and HSTS, and makes
   the server refuse to boot with a weak/missing JWT secret.
4. Never commit `.env` (already in `.gitignore`).

## Important constraint

This app stores its database (`data/atelier.sqlite`) and uploads
(`public/uploads/`) **on local disk**, so it needs a host with a
**persistent disk** and a **single instance**. Serverless platforms
(Vercel, Netlify, Cloudflare Pages) will lose your data — don't use them
for this app as-is.

## Recommended hosts

### Option 1 — Render (easiest, recommended)
Closest Heroku-style experience: git push to deploy, free HTTPS, custom domains.

1. Push the repo to GitHub (without `node_modules`, `data/`, `public/uploads/`).
2. Create a **Web Service**, build `npm install`, start `npm start`.
3. Add a **Persistent Disk** (1 GB is plenty to start), mounted at `/data`.
4. Environment: `NODE_ENV=production`, `JWT_SECRET=...`, `ADMIN_PASSWORD=...`,
   `DB_PATH=/data/atelier.sqlite`.
5. For uploads, either symlink `public/uploads` onto the disk in a build step,
   or mount a second disk path — simplest is one disk at `/data` plus:
   `UPLOADS`: move uploads later if traffic grows.

### Option 2 — Railway
Fastest setup (auto-detects Node). Add a **Volume**, mount it, set the same
env vars. Watch usage-based billing — set a budget alert.

### Option 3 — Fly.io (cheapest small VM)
A single shared VM is a few dollars/month; attach a **Fly Volume** for
`/data`. Needs a small Dockerfile and CLI comfort.

### Option 4 — A VPS (Hetzner / DigitalOcean)
Full control, flat price. Install Node 18+, run the app with `pm2`, put
**Caddy** (automatic HTTPS) or Nginx in front. Most work, most freedom.

## Database hosting

SQLite on a persistent disk is genuinely fine for a portfolio/blog at this
scale — it's one file, fast, zero cost. Set `DB_PATH` to the mounted volume
and back the file up occasionally (it's a single file — copy it).

Upgrade paths if you ever outgrow it:
- **Turso** — hosted SQLite-compatible (libSQL); smallest migration.
- **Neon or Supabase** — managed Postgres free tiers; requires porting the
  queries in `db.js` to Postgres.
- Move media uploads to **Cloudinary** or **S3/R2** if the disk fills up.

## Post-deploy checklist

- [ ] `https://yoursite.com/admin` loads and old default login `admin/admin123` fails
- [ ] Login works with your new password; change it again from the dashboard if it was ever the default
- [ ] Upload an image in the dashboard and confirm it appears on the site
- [ ] `curl -I https://yoursite.com` shows `Strict-Transport-Security` and no `X-Powered-By`
- [ ] Contact form works, and a 6th rapid submission returns 429
