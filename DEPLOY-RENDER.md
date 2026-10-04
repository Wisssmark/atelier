# Deploy Atelier to Render

This gets your full site (blog CMS + admin) live at a real web address.

## What it costs
- **Starter instance: ~$7/month** — always-on, no cold starts.
- **1 GB persistent disk: ~$0.25/month** — stores your posts, settings, and uploaded media so they survive restarts.
- **Total: ~$7.25/month, flat** (no renewal spike).
- A **Free** instance is $0 but its storage is wiped on every restart/redeploy — fine to *test the look*, not to run a real blog. (`render.yaml` is set to Starter for this reason; change `plan: starter` to `plan: free` to test.)

## One-time accounts you'll need (I can't create these for you)
1. A **GitHub** account (free) — Render pulls your code from here.
2. A **Render** account (free to sign up) — sign in with that GitHub account in one click.

## Steps
1. Create a GitHub account, then a new **empty** repository (e.g. `atelier`).
2. Upload this whole `atelier` folder to that repo (GitHub's "upload files" button works — drag the files in). Do **not** upload the `node_modules` or `data` folders.
3. Go to Render → **New → Blueprint** → connect your GitHub → pick the `atelier` repo. Render reads `render.yaml` automatically.
4. When prompted, set the one secret value: **ADMIN_PASSWORD** (choose a strong password). `JWT_SECRET` is generated for you.
5. Click **Apply**. First build takes a few minutes. You'll get a URL like `https://atelier.onrender.com`.
6. Log in at `https://atelier.onrender.com/admin` with `admin` and the password you set.

## Point your GoDaddy domain at it (optional)
In Render → your service → **Settings → Custom Domains** → add your domain. Render shows a DNS record (a CNAME). Add that record in GoDaddy → Domain → DNS. Propagation takes up to an hour.

## Updating the site later
Edit content from the `/admin` dashboard — no redeploy needed. Only code changes require re-uploading to GitHub (Render redeploys automatically).
