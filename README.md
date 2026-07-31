# Yasodha AI Medical Assistant

An AI-powered voice consultation system for hospital use: doctors and
patients speak naturally, the conversation is transcribed live, and Gemini
generates a clinical summary, assistive diagnosis, prescription suggestions
(drawn only from the hospital's medicine formulary), and a downloadable PDF
report.

## Status: Milestone 1 — Foundation

This milestone delivers: MySQL schema, Flask backend (JWT auth, dashboard
API), and a React + Tailwind frontend (landing page, login, dashboard shell)
wired end-to-end against real data.

**Not yet built** (future milestones): live voice consultation UI, WebSocket
transcript streaming, Gemini summarization/prescription generation, Whisper
STT, PDF report generation, full CRUD for patients/doctors/medicines,
deployment.

## Structure

```
AI_medical/
├── backend/        Flask API (see backend/README below)
├── frontend/        React + Vite + Tailwind app
├── database/        schema.sql (reference DDL, mirrors backend/portal/models)
└── documentation/    setup notes
```

## Quick start

### 1. Database

MySQL database `hospital` already created locally. To recreate elsewhere:

```sql
CREATE DATABASE hospital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate            # Windows
pip install -r requirements.txt
cp config/dev.ini.example config/dev.ini   # then fill in the DB password,
                                           # secret keys and Gemini key
flask db upgrade                    # create tables
python -m portal.seeds              # seed roles + demo admin/doctor accounts
python app.py                       # http://127.0.0.1:5000
```

Configuration lives in `backend/config/dev.ini` (git-ignored). `config.py`
reads it, or `config/prod.ini` when `APP_ENV=production`; any single value
can be overridden by an environment variable of the name documented in
`dev.ini.example`, so a server never needs the file on disk.

Seeded logins:
- Admin: `admin@yasodhahospitals.com` / `Admin@123`
- Doctor: `sandeep.viswanadh@yasodhahospitals.com` / `Doctor@123`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`frontend/.env` sets `VITE_API_BASE_URL` (defaults to
`http://127.0.0.1:5000/api`).

## Verifying it works

1. Start the backend, then the frontend.
2. Open `http://localhost:5173` → landing page.
3. Click **Get Started** / **Sign in** → log in with the seeded doctor
   account above.
4. You should land on `/dashboard` showing the doctor's name and live
   (currently zero/seed-level) counts pulled from MySQL — not hardcoded
   numbers.
