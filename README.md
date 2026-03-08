# EvalueX

## What Works Currently

- **Frontend:** Fully functional React + Vite app using Tailwind CSS and Shadcn UI. All pages and routing are working.
- **Database:** Supabase is set up and stores all required tables and data. Migrations are applied.
- **Backend:** Node.js Express server is present and connects to Supabase and Google Gemini for grading and OCR. (Python backend planned, not yet implemented.)

## How to Run

### Frontend
```sh
npm install
npm run dev
```

### Backend
```sh
cd server
npm install
npm run start
```

## Project Structure
- `src/` — Frontend code
- `server/` — Backend code (Node.js)
- `supabase/` — Database migrations and config

## Notes
- .env files are required for both frontend and backend (see .env.example)
- Only the features above are working; other features are not yet implemented.
