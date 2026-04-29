# CartSense

CartSense is a household grocery companion: store-grouped shopping lists, receipt-confirmed inventory updates, and nutrition-balance insights.

## Tech

- Backend: Python Flask (API + SQLite)
- Frontend: React + TypeScript (Vite + MUI)

## Run locally

1. Backend
   - `cd backend`
   - `pip install -r requirements.txt`
   - (optional) create `backend/.env` from `backend/.env.example`
   - `python app.py`
2. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev`

Open the frontend at `http://localhost:5173`.

**Invites:** Share the generated link (`/join?token=...`). New users must **register with the same email** the invite was sent to; existing users sign in and open the link (or paste the token) and tap **Accept invite**.

**Receipt OCR:** For photo receipts, install Tesseract OCR (see `backend/README.md`).

## API (high level)

- Auth: `/api/auth/*`
- Household: `/api/households/*`
- Shopping list: `/api/shopping-list/*`
- Inventory: `/api/inventory`
- Receipts: `/api/receipts/*`
- Insights: `/api/households/:household_id/insights`

