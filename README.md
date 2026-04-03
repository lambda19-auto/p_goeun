# Run Locally

**Prerequisites:** Node.js 22+ and PostgreSQL 14+

1. Install dependencies:
   `npm install`
2. Copy env file and fill in secrets:
   `cp .env.example .env`
3. Ensure PostgreSQL is running and env variables point to it.
4. Run the app:
   `npm run dev`

## Run in containers (app + PostgreSQL)

The project includes `docker-compose.yml` with two containers:
- `db` (PostgreSQL)
- `app` (Node.js service)

They are connected with an explicit bridge network `app_bridge`, and the service reaches the database via `POSTGRES_HOST=db`.

Start everything:

```bash
docker compose up --build
```

API will be available at `http://localhost:3000`.
