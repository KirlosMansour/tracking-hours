# Project Key-Date Tracker

A standalone Flask + Postgres web app for tracking key dates (milestones and
deliverables) across your team's projects. No Claude account needed to use it
once deployed — it's just a normal website.

## What's in here
- `app.py` — Flask backend + REST API + database models
- `templates/index.html`, `static/style.css`, `static/app.js` — the frontend (plain HTML/CSS/JS, no build step)
- `requirements.txt` — Python dependencies
- `render.yaml` — one-click Render deployment config (creates the web service *and* the Postgres database together)

## Deploy to Render (recommended — free tier works)

**Option A: Using render.yaml (easiest)**
1. Push this folder to a GitHub repo.
2. In Render, click **New → Blueprint**, connect the repo, and Render will read `render.yaml` and create both the web service and the free Postgres database automatically, wiring `DATABASE_URL` for you.
3. Click **Apply** — after the build finishes, your app is live at the URL Render gives you (e.g. `project-tracker.onrender.com`).

**Option B: Manual setup**
1. In Render, create a **New → PostgreSQL** database (free tier). Copy its **Internal Connection String**.
2. Create a **New → Web Service**, connect your repo.
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
3. In the web service's **Environment** tab, add `DATABASE_URL` = the connection string from step 1.
4. Deploy. On first run the app automatically creates its tables and seeds two example projects — delete those once you add real data.

## Run locally first (optional, to try it before deploying)
```bash
pip install -r requirements.txt
python app.py
```
Then open http://localhost:5000 — this uses a local SQLite file (`tracker.db`) automatically when `DATABASE_URL` isn't set, so you don't need Postgres just to try it out.

## Notes
- Anyone with the URL can view and edit data — there's no login. If you need to restrict access, the simplest options are Render's built-in basic auth add-on, or asking me to add a simple password gate / user accounts.
- Free-tier Render web services spin down after inactivity and take ~30–60 seconds to wake up on the next visit. Upgrade to a paid instance if that's a problem for daily use.
- The free Postgres database on Render expires after 90 days unless upgraded — worth knowing before you rely on it long-term.
