# CartSense

CartSense is a shared household grocery management web app that helps users plan shopping, confirm purchases from receipts, track inventory, manage essential-item thresholds, and view household insights.

## Features

- Shared household accounts with invites
- Store-grouped shopping list
- Receipt upload and confirmation for inventory updates
- Inventory tracking with category and store views
- Essential item thresholds with notifications and optional email alerts
- Purchase history with purchaser tracking
- Nutrition and shopping insights based on purchased categories
- Manual product and receipt-alias mappings in Settings
- Landing page plus app workspace with top navigation

## Tech stack

### Frontend
- React
- TypeScript
- Vite
- Material UI
- React Router
- Recharts

### Backend
- Python
- Flask
- Flask-CORS
- Flask-JWT-Extended
- Flask-SQLAlchemy
- SQLite

### Receipt parsing
- pdfplumber
- pypdf
- Pillow
- pytesseract

## Project structure

```text
CartSense/
  backend/
    app.py
    migrate_schema.py
    receipt_parse.py
    requirements.txt
  frontend/
    package.json
    src/
  README.md
  .gitignore
```

## Local setup

### 1) Backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

Windows:
```bash
venv\Scripts\activate
```

macOS/Linux:
```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
python app.py
```

The API runs at:

```text
http://localhost:5000
```

### 2) Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

## Environment and configuration

CartSense can run without email, but email alerts for essential items require SMTP configuration.

Create a `.env` file inside `backend/` if needed.

Example values:

```env
CARTSENSE_SMTP_HOST=smtp.gmail.com
CARTSENSE_SMTP_PORT=587
CARTSENSE_SMTP_USER=your_email@example.com
CARTSENSE_SMTP_PASSWORD=your_password_or_app_password
CARTSENSE_FROM_EMAIL=your_email@example.com
TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe
```

### Notes
- `TESSERACT_CMD` is mainly needed on Windows if Tesseract is not already on PATH.
- Receipt image OCR needs Tesseract installed locally.
- PDF receipts use text extraction first.

## Invite flow

- A household member generates an invite link.
- New users should register with the same email address the invite was sent to.
- Existing users can sign in and accept the invite from the join link.

## Notifications and email

CartSense supports:
- in-app notifications for inventory updates and essential item alerts
- optional email alerts when an essential item goes below its threshold

If SMTP variables are not configured, the in-app notification flow still works.

## Troubleshooting

### Login fails on startup
If startup fails because of old local database state, back up and remove:

```text
backend/cartsense.db
```

Then restart the backend.

### Receipt OCR is weak
- confirm Tesseract is installed
- set `TESSERACT_CMD` if needed
- use cleaner receipt images with better contrast

### Frontend cannot connect to backend
Make sure both servers are running:
- backend on `5000`
- frontend on `5173`

## License

This project was built for academic use and can be adapted further as needed.