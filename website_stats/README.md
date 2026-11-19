# HolidayVote statistics website

A tiny, single-file PHP page that shows statistics from your HolidayVote Supabase database:

- total number of vacations
- houses per vacation
- owner and members of each vacation

Designed for **local-network hosting only** (e.g. a Synology NAS). Do **not** expose this to the internet without adding authentication — it connects directly to your database as the `service_role`, bypassing the app's row-level security.

## Files

| File | Purpose |
|------|---------|
| `index.php` | The stats page (plain PHP, no dependencies) |
| `config.example.php` | Copy to `config.php` and add your DB credentials |
| `.gitignore` | Keeps `config.php` out of version control |

## Requirements

- PHP with the `pdo_pgsql` extension enabled
- A web server (Apache, Nginx, or PHP's built-in server)
- Network access to your Supabase project's database host

## Synology NAS setup

### Option A: Web Station (built into DSM)

1. Install **Web Station** from the Synology Package Center.
2. In Web Station → PHP Settings, make sure a PHP version with **PostgreSQL PDO** (`pdo_pgsql`) is enabled.
3. Create a folder for the site, e.g. `/web/stats/`, and copy `index.php`, `config.example.php`, and `.gitignore` into it.
4. Copy `config.example.php` → `config.php` and fill in your Supabase database credentials (host, port, dbname, user, password).
5. In Web Station → Web Server, add a virtual host or use the default HTTP backend pointing at that folder.
6. Open `http://<your-nas-ip>/stats/` in your browser.

> If PHP's PostgreSQL extension is not enabled in DSM's Web Station, install it via Package Center → PHP extensions, or use Option B.

### Option B: Docker (recommended if Web Station lacks `pdo_pgsql`)

Create a `docker-compose.yml` next to the `stats/` folder:

```yaml
version: '3.8'

services:
  holidayvote-stats:
    image: php:8.2-apache
    ports:
      - "8080:80"
    volumes:
      - ./stats:/var/www/html
    environment:
      - PGHOST=db.xxxxxx.supabase.co
      - PGPORT=5432
      - PGDATABASE=postgres
      - PGUSER=postgres
      - PGPASSWORD=your-database-password
```

Then:

```bash
docker compose up -d
```

Open `http://<your-nas-ip>:8080/`.

> `index.php` reads credentials from `config.php` first; if that's missing it falls back to `getenv()` (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`).

### Option C: PHP built-in server (quick test only)

```bash
cd stats
php -S 0.0.0.0:8080
```

Then open `http://<your-nas-ip>:8080/`. Not recommended for persistent hosting.

## Getting your Supabase database credentials

1. Open your Supabase project dashboard.
2. Go to **Settings → Database**.
3. Note **Host**, **Port** (usually `5432`; the connection pooler uses `6543`), **Database name** (`postgres`), and **User** (`postgres`).
4. The **password** is the one you set when you ran `npm run supabase:setup` (or created the project in the dashboard).

Put these into `stats/config.php` (copy from `config.example.php`).

## Security

- This page connects directly to PostgreSQL as the `postgres` user — it bypasses Row Level Security and can read everything.
- Keep `config.php` out of git (handled by `.gitignore`).
- Only expose this on your local network. Use your Synology's firewall or DSM access restrictions to limit which devices can reach it.
- Consider adding HTTP basic auth in Web Station or behind a reverse proxy if multiple people share the NAS.

## Queries used

Four REST API calls (all with `service_role` key, bypassing RLS):

```http
GET /rest/v1/vacations?select=id,name,destination,created_at,owner_id&deleted_at=is.null&order=created_at.desc
GET /rest/v1/profiles?select=id,display_name
GET /rest/v1/vacation_members?select=vacation_id,user_id,display_name
GET /rest/v1/properties?select=vacation_id&deleted_at=is.null
```

PHP combines these into one table showing: vacation name, destination, created date, owner name, member names (with count), and house count.

## License

Internal side-project tool — no license.
