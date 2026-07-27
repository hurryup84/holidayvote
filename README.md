# HolidayVote

Webservice zur gemeinsamen Auswahl von Ferienhäusern. Gruppen können Links sammeln, mit 1–3 Sternen bewerten, Vetos setzen und so schneller eine Entscheidung treffen.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- **Hosting:** Vercel + Supabase Cloud

## Voraussetzungen

- Node.js **20.9+** (empfohlen: 22 LTS)
- npm
- Ein [Supabase](https://supabase.com)-Projekt
- Ein [Vercel](https://vercel.com)-Account (für Deployment)

---

## Lokale Entwicklung

### 1. Repository klonen & Dependencies installieren

```bash
git clone <repo-url> ferienhaus
cd ferienhaus
npm install
```

### 2. Supabase-Projekt einrichten

#### 2.1 Neues Projekt anlegen

1. Gehe zu [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New Project** → Name z. B. `holidayvote`, Region wählen, Passwort setzen
3. Warte, bis das Projekt bereit ist (~2 Minuten)

#### 2.2 Datenbank-Schema migrieren

1. Öffne im Supabase Dashboard **SQL Editor**
2. Kopiere den gesamten Inhalt von `supabase/migrations/001_initial_schema.sql`
3. Führe das SQL aus (**Run**)

Alternativ mit der Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <deine-project-ref>
supabase db push
```

#### 2.3 Auth konfigurieren (Magic Link)

1. Dashboard → **Authentication** → **Providers** → **Email**
2. Stelle sicher, dass **Email** aktiviert ist
3. Unter **Authentication** → **URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs** hinzufügen:
     ```
     http://localhost:3000/auth/callback
     http://localhost:3000/**
     ```

> Für Production später die Vercel-URL ergänzen (siehe unten).

#### 2.4 API-Keys kopieren

Dashboard → **Project Settings** → **API**:

| Variable | Wo finden |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / public Key |

### 3. Umgebungsvariablen setzen

```bash
cp .env.local.example .env.local
```

`.env.local` ausfüllen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Dev-Server starten

```bash
npm run dev
```

App öffnen: [http://localhost:3000](http://localhost:3000)

---

## Deployment auf Vercel

### 1. Repository mit GitHub verbinden

1. Code auf GitHub pushen
2. [vercel.com/new](https://vercel.com/new) → Repository importieren
3. Framework Preset: **Next.js** (wird automatisch erkannt)

### 2. Umgebungsvariablen in Vercel setzen

Unter **Settings** → **Environment Variables**:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Production, Preview, Development |
| `NEXT_PUBLIC_APP_URL` | `https://deine-app.vercel.app` | Production |
| `NEXT_PUBLIC_APP_URL` | `https://$VERCEL_URL` oder Preview-URL | Preview |

> **Wichtig:** `NEXT_PUBLIC_APP_URL` muss in Production die finale Domain sein – sie wird für Magic-Link-Redirects und Einladungslinks verwendet.

### 3. Deployen

```bash
# Optional: Vercel CLI
npm install -g vercel
vercel
```

Oder: Push auf `main` → Vercel deployt automatisch.

### 4. Supabase für Production anpassen

Nach dem ersten Deploy in Supabase unter **Authentication** → **URL Configuration**:

- **Site URL:** `https://deine-app.vercel.app`
- **Redirect URLs** ergänzen:
  ```
  https://deine-app.vercel.app/auth/callback
  https://deine-app.vercel.app/**
  https://*.vercel.app/auth/callback
  ```

Die letzte Zeile erlaubt Preview-Deployments.

---

## Projektstruktur

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Landing Page
│   ├── dashboard/          # Urlaubs-Übersicht
│   ├── vacation/new/       # Urlaub erstellen
│   ├── v/[inviteCode]/     # Urlaub-Detail (Einladungslink)
│   ├── auth/callback/      # Magic-Link Callback
│   └── api/og-fetch/       # OpenGraph-Extraktion
├── actions/                # Server Actions
├── components/             # UI-Komponenten
└── lib/                    # Utils, Supabase Client, Types
supabase/
└── migrations/             # SQL-Schema
concept/
└── HolidayVote_Entwicklungsplan.md
```

---

## Features (V1 MVP)

- [x] Magic-Link-Login (kein Passwort)
- [x] Urlaub anlegen mit Einladungscode
- [x] Einladungslink teilen (WhatsApp/Signal)
- [x] Ferienhaus-Link einfügen mit OpenGraph-Vorschau
- [x] Manuelle Felder: Preis, Betten, Schlafzimmer, Pool
- [x] Bewertung 1–3 Sterne
- [x] Ein Veto pro Person pro Urlaub
- [x] Sortierung: Sterne → Vetos → Preis
- [x] Kommentare
- [x] Status: Aktiv / Ausgeschieden / Gebucht
- [x] Mobile-First UI

---

## Häufige Probleme

### Magic Link funktioniert nicht

- Prüfe, ob `NEXT_PUBLIC_APP_URL` korrekt gesetzt ist
- Prüfe Supabase Redirect URLs (localhost vs. Production)
- Magic-Link-E-Mails landen im Spam-Ordner

### OpenGraph-Daten werden nicht geladen

- Manche Portale blockieren serverseitige Requests
- Felder können manuell ausgefüllt werden (Fallback)
- In Production kann es je nach Portal anders funktionieren als lokal

### „Urlaub nicht gefunden" nach Einladungslink

- SQL-Migration vollständig ausgeführt?
- `join_vacation_by_invite` Funktion vorhanden?
- Einladungscode in der URL korrekt?

### Build schlägt fehl

- Node.js Version prüfen: `node -v` → mindestens 20.9
- Mit nvm: `nvm use 22`

---

## Nützliche Befehle

```bash
npm run dev       # Entwicklungsserver
npm run build     # Production Build
npm run start     # Production Server lokal
npm run lint      # ESLint
```

---

## Weiterentwicklung

Siehe [concept/HolidayVote_Entwicklungsplan.md](concept/HolidayVote_Entwicklungsplan.md) für die Roadmap (V1.1, V2, V3).

## Lizenz

Privates Projekt.
