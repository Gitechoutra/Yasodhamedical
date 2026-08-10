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
python -m portal.seeds              # seed roles, admin account, and default medicine master data
python app.py                       # http://127.0.0.1:5000
```

Configuration lives in `backend/config/dev.ini` (git-ignored). `config.py`
reads it, or `config/prod.ini` when `APP_ENV=production`; any single value
can be overridden by an environment variable of the name documented in
`dev.ini.example`, so a server never needs the file on disk.

Seeded logins:
- Admin: `admin@yasodhahospitals.com` / `Admin@123`
- Doctor: `sandeep.viswanadh@yasodhahospitals.com` / `Doctor@123`
- Nurse: `lakshmi.rao@yasodhahospitals.com` / `Nurse@123`

The seeder creates reference data: roles, the default admin account, and the
default medicine master data (the clinical formulary and the pharmacy brand
catalogue, in `portal/seeders/seed_medicines.py`) — every developer gets the
same medicines after `git pull` without inserting them by hand. Re-running
`python -m portal.seeds` is always safe: existing rows, including any
medicine a developer added or edited manually, are left untouched. It
deliberately does not create patients: a patient with no assigned doctor is
invisible to every doctor (see `portal/helpers/patient_access.py`), so demo
rows only ever showed up as clutter. Register patients through the front desk
instead.

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

## Nursing module

After a consultation, surgery or procedure the doctor hands the patient to a
nurse for the observation period. That hand-off — a **nursing assignment** —
is what scopes the whole module: a nurse sees exactly the patients assigned to
them, and every medication log, observation, note and alert hangs off one.

Ownership is split, and enforced server-side rather than only hidden in the UI:

| | Doctor | Nurse |
|---|---|---|
| Assign / reassign / close the watch | ✅ | — |
| Treatment plan & care instructions | ✅ | read-only |
| Medication schedule (which drugs, how often) | ✅ | read-only |
| Log each dose (completed / delayed / missed / skipped) | — | ✅ |
| Vitals, symptoms, recovery, complications | — | ✅ |
| Nursing notes & shift handover | — | ✅ |
| Raise an alert | — | ✅ |
| Acknowledge / resolve an alert | ✅ | — |

Neither side can do the other's job, which is what makes the record an audit
trail rather than a shared scratchpad.

**Escalation is partly automatic.** Marking a dose *missed*, or recording
vitals outside the ward ranges in `models/patient_observation.py`, raises a
clinical alert and notifies the treating doctor without the nurse having to
remember to escalate. Anything else the nurse flags by hand.

**Where things live**

- Nurse portal: `/nurse/login` → `/nurse` (its own layout; doctors and admins
  are redirected out, and nurses are redirected out of `/dashboard`)
- Doctor's remote monitor: `/dashboard/nursing` — compliance, open alerts and
  the full nursing log for every patient they've handed over
- API: `/api/nursing/*` (`routes/nursing_routes.py`), scoped by
  `helpers/nursing_access.py`
- Live updates ride a `nursing_changed` socket event, so a doctor watching a
  record sees the nurse's entries as they land

The timeline at `GET /api/nursing/assignments/<id>/timeline` is assembled from
the four record tables on read — there is no separate timeline table, so there
is no second copy of the truth to disagree with the first.
