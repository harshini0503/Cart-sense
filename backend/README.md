# CartSense Backend (Flask)

## Setup

1. Create a virtual environment (recommended).
2. Install dependencies:
   - `pip install -r requirements.txt`
3. (Optional) Create `.env` from `.env.example` in this folder.

## Run

- `python app.py`

The API will be on `http://localhost:5000`.

## Notes

- **Receipt parsing:** PDFs use text extraction (`pdfplumber` / `pypdf`). Images use **Tesseract OCR** via `pytesseract` — install [Tesseract](https://github.com/tesseract-ocr/tesseract) and optionally set `TESSERACT_CMD` to the `tesseract` binary. If OCR is unavailable, the API falls back to filename-based hints.
- **Database:** If an older `cartsense.db` fails to migrate, back it up and remove it, then restart the server.
- Shopping list checkout is idempotent per active shopping list (won't double count).

