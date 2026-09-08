# FastAPI + SQLite backend

SQLite needs no server and no separate installation. Starting FastAPI automatically
creates `backend/data/h2s_dosimeter.db`.

When `backend/secrets/firebase-service-account.json` exists, analyses are written to
Firestore and also retained in SQLite as a local fallback. The secret file is ignored
by Git and must never be committed.

From the project root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/docs` to inspect and test the API.

In a second terminal run the frontend:

```powershell
npm run dev
```

Optional environment settings:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Set `H2S_DATABASE_PATH` before starting FastAPI only if you want the database file
somewhere other than `backend/data/h2s_dosimeter.db`.
