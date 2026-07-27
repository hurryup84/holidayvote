# Entwicklungsplan – HolidayVote

**Projektname (Arbeitstitel):** HolidayVote

## Vision

> „Eine Gruppe kann innerhalb weniger Minuten einen gemeinsamen Urlaub organisieren, ohne Excel-Listen, Chat-Chaos oder unübersichtliche Link-Sammlungen."

HolidayVote ist ein Webservice, mit dem mehrere Personen gemeinsam Ferienhäuser sammeln, vergleichen, bewerten und eine finale Entscheidung treffen können. Der Fokus liegt auf extrem einfacher Bedienung, Teilen von Links direkt aus WhatsApp/Signal, transparenter Gruppenentscheidung und Mobile-First-Nutzung.

---

# Version 1 – Erster öffentlicher Release

**Ziel:** Der Kern-Loop funktioniert end-to-end: Link teilen → Haus hinzufügen → bewerten → sortierte Liste → Entscheidung.

**Zeitschätzung:** ca. 4–5 Wochen (1 Entwickler)

## Scope

### Enthalten

| # | Feature | Beschreibung |
|---|---|---|
| 1 | Magic-Link-Login | Anmeldung per E-Mail, kein Passwort |
| 2 | Urlaub anlegen | Name, Beschreibung, Reiseziel, Zeitraum |
| 3 | Einladungslink | Teilbar via WhatsApp/Signal; führt direkt in den Urlaub |
| 4 | Link einfügen | Unterstützte Quellen: Airbnb, Booking, FeWo-direkt, Novasol, Traumferienwohnungen, beliebige URLs |
| 5 | OpenGraph-Vorschau | Automatisch: Titel, Vorschaubild, Beschreibung, Anbieter, URL |
| 6 | Manuelle Felder | Preis, Betten, Schlafzimmer, Badezimmer, Pool (Ja/Nein) |
| 7 | Bewertung | Jeder Teilnehmer vergibt 1–3 Sterne pro Haus |
| 8 | Veto | Ein Veto pro Teilnehmer pro Urlaub: „Dieses Haus kommt für mich nicht infrage." |
| 9 | Sortierung | Standard: höchste Bewertung → wenigste Vetos → niedrigster Preis |
| 10 | Kommentare | Kurzer Text, optional mit Stern-Bezug (z. B. „⭐⭐⭐ Perfekter Pool") |
| 11 | Mobile-First UI | Responsive, touch-optimiert |

### Rollen (V1)

| Rolle | Rechte |
|---|---|
| **Owner** | Urlaub erstellen, bearbeiten, löschen; Mitglieder verwalten |
| **Member** | Häuser hinzufügen, voten, veto, kommentieren |

Kein separates Gast-Konto: Einladungslink führt zur Magic-Link-Anmeldung; Name wird beim ersten Besuch abgefragt.

### Status (V1)

Jedes Haus hat einen von drei Stati:

| Status | Bedeutung |
|---|---|
| **Active** | Wird diskutiert / bewertet |
| **Eliminated** | Durch Veto oder manuell ausgeschieden |
| **Booked** | Finale Entscheidung getroffen |

### Preislogik

- Primär: **Gesamtpreis für den Zeitraum** (vom Nutzer eingegeben)
- Anzeige zusätzlich: **Preis pro Person** = Gesamtpreis ÷ Anzahl Teilnehmer
- Sortierung nach Gesamtpreis

### Berechtigungen

| Aktion | Owner | Member |
|---|---|---|
| Urlaub bearbeiten/löschen | ✓ | |
| Haus hinzufügen | ✓ | ✓ |
| Haus löschen | ✓ | nur eigene Vorschläge |
| Voten / Veto / Kommentieren | ✓ | ✓ |
| Status auf „Booked" setzen | ✓ | |

---

## Akzeptanzkriterien

- [ ] Nutzer kann sich per Magic Link anmelden und einen Urlaub anlegen
- [ ] Einladungslink kann per WhatsApp geteilt werden; Empfänger landet nach Anmeldung direkt im Urlaub
- [ ] Link von Airbnb, Booking und FeWo-direkt liefert Titel + Bild via OpenGraph
- [ ] Fehlende OG-Daten können manuell ergänzt werden
- [ ] Jeder Teilnehmer kann pro Haus 1–3 Sterne vergeben und einmal vetoen (pro Urlaub)
- [ ] Häuser werden nach Bewertung → Vetos → Preis sortiert angezeigt
- [ ] Kommentare sind sichtbar und mit optionalem Stern-Bezug
- [ ] UI funktioniert auf Smartphone (375px Breite) ohne horizontales Scrollen
- [ ] Duplikat-URL wird erkannt und abgelehnt (Warnung)
- [ ] Leere Zustände sind gestaltet (kein Haus, keine Stimme, nur ein Teilnehmer)

---

## User Stories

1. **Als Organisator** möchte ich einen Urlaub anlegen und einen Einladungslink per WhatsApp teilen, damit meine Gruppe ohne App-Download mitmachen kann.

2. **Als eingeladener Teilnehmer** möchte ich über den Link meinen Namen eingeben und sofort die Hausliste sehen, damit ich in unter 30 Sekunden starten kann.

3. **Als Teilnehmer** möchte ich einen Ferienhaus-Link einfügen und automatisch Titel und Bild sehen, damit ich nicht alles manuell eintippen muss.

4. **Als Teilnehmer** möchte ich ein Haus mit 1–3 Sternen bewerten und optional begründen, damit die Gruppe meine Präferenz versteht.

5. **Als Teilnehmer** möchte ich ein Veto setzen, damit klar ist, welche Häuser für mich ausscheiden.

6. **Als Teilnehmer** möchte ich eine sortierte Liste sehen (beste Bewertung oben), damit ich schnell die Top-Kandidaten erkenne.

7. **Als Owner** möchte ich ein Haus als „Gebucht" markieren, damit die Gruppe die finale Entscheidung sieht.

8. **Als Teilnehmer** möchte ich fehlende Infos (Preis, Betten) manuell ergänzen, wenn die automatische Vorschau unvollständig ist.

---

## Onboarding-Flow

```
WhatsApp-Link klicken
  → Landing Page (Urlaubsname, Anzahl Häuser, Anzahl Stimmen)
  → Magic Link anfordern (E-Mail) oder direkt Name eingeben (wenn schon angemeldet)
  → E-Mail bestätigen
  → Urlaubs-Übersicht (Hausliste)
```

**Share-Metadaten (OpenGraph für Einladungslinks):**
- Titel: „Sommer 2026 – HolidayVote"
- Beschreibung: „5 Häuser · 3 von 6 haben abgestimmt"
- Bild: Vorschaubild des Top-Hauses oder generisches HolidayVote-Bild

---

## Datenmodell (V1)

```
users
  id, email, name, created_at

vacations
  id, name, description, destination,
  start_date, end_date, invite_code, owner_id, created_at

participants
  vacation_id, user_id, role (owner | member), joined_at

properties
  id, vacation_id, url, title, image_url, description, provider,
  price, beds, bedrooms, bathrooms, has_pool,
  status (active | eliminated | booked),
  suggested_by, created_at, updated_at

votes
  property_id, user_id, stars (1–3)
  UNIQUE (property_id, user_id)

vetoes
  property_id, user_id
  UNIQUE (property_id, user_id)
  -- Business Rule: max 1 Veto pro user pro vacation (App-Logik)

comments
  id, property_id, user_id, text, stars (optional), created_at
```

**Bewusst nicht in V1:**
- Kein House/Listing-Split
- Keine dynamischen Filter
- Keine Favoriten-Tabelle

---

## Tech Stack (V1 – minimal)

### Frontend

| Technologie | Zweck |
|---|---|
| Next.js 15 + React 19 | App Framework, Server Components |
| Tailwind CSS + shadcn/ui | UI-Komponenten |
| Mobile-First | Responsive Design |

### Backend

| Technologie | Zweck |
|---|---|
| Supabase | PostgreSQL, Auth (Magic Link), Storage, RLS |
| Supabase Edge Function | OpenGraph-Fetch beim Link-Einfügen |

**Bewusst nicht in V1:**
- Kein Playwright / Crawler
- Kein BullMQ / Job-Queue
- Kein Supabase Realtime (Polling oder manuelles Refresh reicht)
- Kein Framer Motion (Polish für V1.1)

### Link-Extraktion (V1)

1. Nutzer fügt URL ein
2. Edge Function fetcht die Seite serverseitig
3. OpenGraph-Metadaten (`og:title`, `og:image`, `og:description`) auslesen
4. JSON-LD Structured Data als Fallback (falls vorhanden)
5. Daten speichern; Nutzer ergänzt fehlende Felder manuell

**OG-Fallback:** Wenn keine brauchbaren Metadaten → leeres Formular mit URL vorausgefüllt, Nutzer füllt alles manuell aus.

**Bild-Hosting:** OG-Bild-URL speichern; bei defekten Links Fallback-Platzhalter. Supabase Storage als Proxy erst in V1.1.

---

## Fehlerfälle & Edge Cases (V1)

| Situation | Verhalten |
|---|---|
| OG-Fetch schlägt fehl | Leeres Formular, URL vorausgefüllt, Hinweis „Daten konnten nicht geladen werden" |
| Gleiche URL nochmal | Warnung „Dieses Haus ist bereits in der Liste" |
| Ungültige URL | Validierung vor Submit |
| Teilnehmer ohne Stimme | In Sortierung: 0 Sterne, kein Veto |
| Letzter Owner verlässt Urlaub | Nicht möglich; Owner muss Rolle übertragen oder Urlaub löschen |
| Zeitraum | `start_date` / `end_date` als DATE (keine Uhrzeit); Timezone UTC |

---

## Rechtliches (V1)

- **OpenGraph-Fetch** ist in der Regel unproblematisch (öffentliche Metadaten)
- **Kein tiefes Scraping** in V1
- **DSGVO:** Account löschen (Cascade auf Votes/Vetos/Kommentare), Impressum + Datenschutzerklärung vor öffentlichem Release
- **robots.txt** respektieren beim OG-Fetch

---

## Nicht enthalten in V1 (Out of Scope)

Explizit verschoben – nicht anfangen, auch wenn verlockend:

- House vs. Listing (Duplikaterkennung über Plattformen)
- Match Score (gewichteter Gesamtscore)
- Favoriten-System (❤️)
- Dynamische Filter / KO-Kriterien
- Status-Workflow mit 5 Stati (🟢🟡🔵🔴✅)
- Verfügbarkeitsprüfung (automatisch oder manuell markieren)
- Vorschlag-Historie / Bearbeitungslog
- Kartenansicht
- E-Mail-Benachrichtigungen
- Realtime-Updates
- Urlaub kopieren
- Export (PDF/CSV)
- Dritte Rolle „Organisator"
- Gastzugang ohne Account

---

# Version 1.1 – Quick Wins nach erstem Feedback

**Ziel:** Kleine Erweiterungen auf Basis echter Nutzung, ca. 1–2 Wochen.

| Feature | Beschreibung |
|---|---|
| Favoriten (❤️) | Persönlicher Favorit; Anzeige „6 von 8 haben favorisiert" |
| Erweiterte Status | 🟢 Favorit, 🟡 Wird diskutiert, 🔵 Besichtigung geplant |
| Verfügbarkeit manuell | Nutzer markiert Haus als „Nicht mehr verfügbar" oder „Preis geändert" |
| Vorschlag-Historie | Wer hat wann welches Haus vorgeschlagen |
| Bild-Proxy | OG-Bilder in Supabase Storage cachen (Hotlink-Schutz) |
| Realtime | Supabase Realtime für Live-Updates bei neuen Stimmen |
| Framer Motion | Dezente Animationen für bessere UX |
| PWA | Installierbar auf Homescreen |

---

# Version 2 – Erweiterte Entscheidungshilfe

**Ziel:** Objektivere Vergleichbarkeit und bessere Filter, ca. 4–6 Wochen.

## House vs. Listing

**Problem:** Dasselbe Haus existiert oft auf mehreren Plattformen.

**Lösung:**

| Entität | Inhalt |
|---|---|
| **House** (zentral) | Name, Koordinaten, Ausstattung, Bilder, Bewertungen |
| **Listing** (plattformabhängig) | URL, Anbieter, Preis, Verfügbarkeit, Gebühren |

**Vorteile:** Keine doppelten Bewertungen, Preisvergleich zwischen Plattformen, robuste Duplikaterkennung.

## Match Score

Automatischer Gesamtscore (0–100 %) basierend auf:

| Faktor | Gewicht |
|---|---|
| Sterne | Hoch |
| Vetos | Sehr hoch (negativ) |
| Favoriten | Mittel |
| Preis pro Person | Mittel |
| Verfügbarkeit | Hoch |

Score erst sinnvoll, wenn V1-Nutzungsdaten zeigen, welche Gewichtung passt.

## Weitere V2-Features

| Feature | Beschreibung |
|---|---|
| KO-Kriterien | Gruppe definiert Ausschlusskriterien (z. B. „Keine Hunde", „Max. 2.500 €"); Häuser werden ausgegraut |
| Dynamische Filter | User-definierte Kriterien (Boolean, Zahl, Auswahl) |
| Kartenansicht | MapLibre + OpenStreetMap; Häuser auf Karte, Clustering |
| Abstimmung schließen | Organisator sperrt neue Häuser/Stimmen, erzeugt finale Rangliste |
| Erweiterter Crawler | Playwright-Worker für Portale mit schlechten OG-Daten |
| Dritte Rolle | Organisator (zwischen Owner und Member) |
| E-Mail-Benachrichtigungen | Neues Haus, neue Bewertung, neues Veto |

### Dynamische Filter (V2)

| Typ | Beispiel |
|---|---|
| Boolean | Waschmaschine, Sauna |
| Zahl | Poolgröße (m²), Entfernung Strand (m) |
| Auswahl | Haustierart |
| Mehrfachauswahl | Ausstattung |
| Text | Freitext |

---

# Version 3 – Export & Automatisierung

**Ziel:** Professionelle Auswertung und proaktive Updates, ca. 3–4 Wochen.

| Feature | Beschreibung |
|---|---|
| PDF-Export | Bilder, Preise, Bewertungen, Vetos, Kommentare, Links |
| Excel/CSV-Export | Für weitere Analysen |
| Automatische Verfügbarkeitsprüfung | Worker prüft URLs periodisch |
| Preisverlauf | Historie der Preisänderungen |
| Urlaub kopieren | Sommer 2026 → Sommer 2027 (Teilnehmer, Filter, Regeln) |
| Push-Benachrichtigungen | Preis gesunken, Haus nicht mehr verfügbar |
| KI-Unterstützung | Automatische Zusammenfassung, Empfehlung |

---

# Technische Architektur (Gesamtvision)

## Frontend

- **Next.js 15 + React 19** – Server Components, SEO, schnelle Entwicklung
- **Tailwind CSS + shadcn/ui** – UI-Komponenten
- **Framer Motion** – ab V1.1
- **MapLibre + OpenStreetMap** – ab V2

## Backend

- **Supabase** – PostgreSQL, Auth, Realtime, Storage, Row Level Security, Edge Functions
- **BullMQ + Playwright** – ab V2 für asynchronen Crawler

## Crawler-Pipeline (ab V2)

```
Nutzer fügt Link ein
  → Job in Queue (BullMQ)
  → Worker lädt Seite (Playwright)
  → OpenGraph + JSON-LD lesen
  → Bilder extrahieren
  → Daten speichern
  → Frontend erhält Realtime-Update
```

---

# Entwicklungs-Roadmap

| Phase | Umfang | Dauer | Meilenstein |
|---|---|---|---|
| **V1** | Kern-Loop: Login, Urlaub, Link, Vote, Sort | 4–5 Wochen | Erster öffentlicher Release |
| **V1.1** | Favoriten, Status, Realtime, Bild-Proxy | 1–2 Wochen | Feedback-Iteration |
| **V2** | House/Listing, Match Score, Karte, Filter | 4–6 Wochen | Entscheidungshilfe |
| **V3** | Export, Auto-Verfügbarkeit, Urlaub kopieren | 3–4 Wochen | Power-User-Features |

**Gesamt bis V3:** ca. 12–17 Wochen

---

# Offene Fragen (vor Start V1 klären)

| Frage | Optionen | Empfehlung V1 |
|---|---|---|
| Sprache | Nur DE / Mehrsprachig | Nur DE |
| Hosting | Vercel + Supabase Free Tier | Ja, für Start ausreichend |
| Domain | holidayvote.de o. ä. | Vor Release klären |
| Max. Häuser pro Urlaub | Unbegrenzt / Limit | Unbegrenzt (RLS schützt) |
| Max. Teilnehmer pro Urlaub | Unbegrenzt / Limit | Unbegrenzt |
| Analytics | Plausible / none | Plausible (DSGVO-konform), ab V1.1 |
