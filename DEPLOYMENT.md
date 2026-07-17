# ThesisBuddy — Produktions-Deployment

Zielumgebung: Dockerhost **10.109.1.25**, Applikation auf **Port 3000**,
produktive URL **https://thesisbuddy.hftm.ch** (TLS terminiert am vorgelagerten
Reverse Proxy, der auf `10.109.1.25:3000` weiterleitet).

Der Stack besteht aus zwei Containern (`docker-compose.yml`):

| Service | Image | Aufgabe |
|---|---|---|
| `app` | lokaler Build (`Dockerfile`, Node 22) | ThesisBuddy inkl. Mail-Cron-Job |
| `db` | `postgres:16-alpine` | Datenbank |

Alle persistenten Daten liegen **ausserhalb der Container** als Bind-Mounts
direkt im Deployment-Verzeichnis:

| Host-Verzeichnis | Container-Pfad | Inhalt |
|---|---|---|
| `/opt/DABUDDY/volumes/db` | `/var/lib/postgresql/data` | PostgreSQL-Daten |
| `/opt/DABUDDY/volumes/uploads` | `/app/uploads` | hochgeladene Dokumente, Vorlagen |
| `/opt/DABUDDY/volumes/appdata` | `/app/data` | App-Einstellungen (Sekretariats-Mail, Benachrichtigungs-Marker) |

---

## Voraussetzungen auf dem Host

- Docker Engine ≥ 24 mit Compose-Plugin (`docker compose version`)
- Zugriff auf das Git-Repository `https://github.com/dadch/DABuddy.git`
  (bei privatem Repo: Personal Access Token oder Deploy Key)
- Ausgehender Zugriff auf den SMTP-Server, `login.microsoftonline.com`
  (M365-Login) und `api.anthropic.com` (LLM-Feedback)

## Schritt-für-Schritt (ausgehend von leerem `/opt/DABUDDY`)

### 1. Code holen

```bash
cd /opt/DABUDDY
git clone https://github.com/dadch/DABuddy.git .
```

### 2. Konfiguration anlegen

```bash
cp .env.production.example .env
chmod 600 .env
```

`.env` bearbeiten und alle `<...>`-Platzhalter ersetzen. Secrets erzeugen mit:

```bash
openssl rand -hex 24   # DB_PASSWORD
openssl rand -hex 32   # SESSION_SECRET
```

Wichtig:
- `MAIL_OVERRIDE_TO` **leer** lassen — sonst werden alle Mails umgeleitet (Test-Modus).
- `MS_REDIRECT_URI=https://thesisbuddy.hftm.ch/auth/microsoft/callback` — dieselbe
  URI muss in der Azure-App-Registrierung als Redirect-URI hinterlegt sein.

### 3. Datenverzeichnisse anlegen

```bash
mkdir -p volumes/db volumes/uploads volumes/appdata
chown -R 1000:1000 volumes/uploads volumes/appdata
```

Die App läuft im Container als unprivilegierter User `node` (uid 1000) —
`uploads` und `appdata` müssen ihm gehören. `volumes/db` verwaltet der
Postgres-Container beim ersten Start selbst.

### 4. Image bauen und Stack starten

```bash
docker compose build
docker compose up -d
docker compose ps        # beide Services müssen "healthy" werden
```

Beim ersten Start legt die Applikation das Datenbankschema automatisch an
(`sequelize.sync`).

### 5. Grunddaten einspielen (einmalig)

```bash
docker compose exec app node seeders/seed.js
```

Das Skript ist idempotent und legt an: die Fachbereiche, das Diplomjahr und den
Admin-Benutzer **admin / password123**.

> **Sofort danach:** als `admin` einloggen und das Passwort im Profil ändern.
> Ausserdem in der Fachbereichsverwaltung die Studienform der Fachbereiche
> prüfen (Default nach Anlage: Berufsbegleitend).

### 6. Funktionskontrolle

```bash
curl -I http://localhost:3000/login       # HTTP 200
docker compose logs -f app                # "ThesisBuddy server running ..."
```

Danach über den Browser: `https://thesisbuddy.hftm.ch` → Login-Seite.
(Voraussetzung: der Reverse Proxy der Infrastruktur zeigt auf `10.109.1.25:3000`.)

### 7. Konfiguration in der Applikation

Als Admin einloggen und einrichten:
1. **Mail-Einstellungen** (Kebab-Menü): SMTP-Test ausführen, Sekretariats-Adresse
   hinterlegen. Das simulierte Tagesdatum muss in Produktion **leer** sein.
2. **Diplomjahr-Verwaltung**: Bezeichnungen (DE/FR) und Aufgabenstellungs-Termine
   (Meilenstein 1/2 je Studienform) erfassen.
3. **Meilenstein-Vorlagen**, Bewertungsformulare, Upload-Kategorien und Vorlagen
   gemäss Prozess einrichten.

---

## Azure-App-Registrierung für das M365-Login

ThesisBuddy verwendet den OAuth-Authorization-Code-Flow mit Client-Secret
(Confidential Client) und den delegierten Berechtigungen `openid`, `profile`,
`email`, `User.Read`. Registrierung im Microsoft Entra Admin Center:

1. **Anmelden**: <https://entra.microsoft.com> mit einem Konto, das Apps
   registrieren darf (z.B. Rolle «Anwendungsadministrator»).
2. **App registrieren**: *Identität → Anwendungen → App-Registrierungen →
   Neue Registrierung*.
   - Name: `ThesisBuddy`
   - Unterstützte Kontotypen: **Nur Konten in diesem Organisationsverzeichnis**
     (Single Tenant — die App verwendet die Tenant-Authority)
   - Umleitungs-URI: Plattform **Web**, URI
     `https://thesisbuddy.hftm.ch/auth/microsoft/callback`
   - *Registrieren* klicken.
3. **IDs notieren** (Seite *Übersicht*):
   - «Anwendungs-ID (Client)» → `MS_CLIENT_ID`
   - «Verzeichnis-ID (Mandant)» → `MS_TENANT_ID`
4. **Client-Secret erstellen**: *Zertifikate & Geheimnisse → Neuer geheimer
   Clientschlüssel* — Beschreibung `ThesisBuddy Prod`, Gültigkeit z.B.
   24 Monate. Den **Wert** (Spalte «Wert», nicht die «Geheimnis-ID»!) sofort
   kopieren → `MS_CLIENT_SECRET`. Der Wert ist später nicht mehr einsehbar.
   Ablaufdatum im Kalender vormerken — danach muss ein neues Secret erstellt
   und in der `.env` ersetzt werden.
5. **API-Berechtigungen prüfen**: *API-Berechtigungen* — `User.Read`
   (Microsoft Graph, delegiert) ist standardmässig vorhanden; `openid`,
   `profile`, `email` werden beim Login automatisch angefordert. Es sind
   **keine Anwendungsberechtigungen** und normalerweise keine
   Administrator-Einwilligung nötig (`User.Read` dürfen Benutzer selbst
   einwilligen). Optional: *Administratoreinwilligung erteilen*, damit
   Benutzer keinen Consent-Dialog sehen.
6. **Authentifizierung prüfen**: *Authentifizierung* — unter «Web» darf nur die
   Callback-URI stehen. «Implizite Genehmigung» (Zugriffs-/ID-Token-Häkchen)
   bleibt **deaktiviert**.
7. **Optional einschränken**: Sollen sich nur berechtigte Personen anmelden
   können, unter *Identität → Anwendungen → Unternehmensanwendungen →
   ThesisBuddy → Eigenschaften* die Option «Zuweisung erforderlich» aktivieren
   und Benutzer/Gruppen zuweisen. (ThesisBuddy lässt ohnehin nur E-Mail-Adressen
   zu, die im System als Benutzer erfasst sind.)
8. **Werte in `.env` eintragen** und App neu starten:

   ```ini
   MS_TENANT_ID=<Verzeichnis-ID>
   MS_CLIENT_ID=<Anwendungs-ID>
   MS_CLIENT_SECRET=<Secret-Wert>
   MS_REDIRECT_URI=https://thesisbuddy.hftm.ch/auth/microsoft/callback
   ```

   ```bash
   docker compose up -d --force-recreate app
   ```

9. **Testen**: Auf `https://thesisbuddy.hftm.ch` → «Mit M365-Login anmelden»
   mit einem M365-Konto, dessen E-Mail-Adresse in ThesisBuddy als Benutzer
   existiert.

Häufige Fehlerbilder: `AADSTS50011` = Redirect-URI stimmt nicht exakt überein
(https, Host, Pfad); `AADSTS7000215` = falsches/abgelaufenes Client-Secret
(Wert statt Geheimnis-ID kopiert?); «E-Mail-Adresse nicht registriert» =
Benutzer existiert in ThesisBuddy nicht — zuerst als Benutzer anlegen.

---

## Betrieb

### Logs und Status

```bash
docker compose logs -f app        # Applikations-Log (inkl. Mail-Job)
docker compose ps                 # Health-Status
```

### Neustart / Stoppen

```bash
docker compose restart app        # nur Applikation
docker compose down               # Stack stoppen (Volumes bleiben erhalten)
docker compose up -d              # Stack starten
```

### Update auf eine neue Version

```bash
cd /opt/DABUDDY
git pull
docker compose build app
docker compose up -d app
```

**Wichtig bei Updates:** `sequelize.sync` legt nur *fehlende Tabellen* an, ändert
aber keine bestehenden. Neue Datenbank-Spalten kommen als idempotente
Migrationsskripte unter `scripts/` mit. Nach einem Update die im Changelog/Commit
genannten Skripte ausführen, z.B.:

```bash
docker compose exec app node scripts/add-study-mode.js
docker compose exec app node scripts/add-assignment-feature.js
```

(Die Skripte sind idempotent — mehrfaches Ausführen ist unschädlich.)

### Backup

Datenbank-Dump (täglich per Cron empfohlen):

```bash
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip \
  > /opt/DABUDDY/backup/dabuddy-$(date +%F).sql.gz
```

Datei-Uploads und App-Einstellungen liegen als normale Host-Verzeichnisse vor
und können direkt gesichert werden:

```bash
tar czf /opt/DABUDDY/backup/uploads-$(date +%F).tgz -C /opt/DABUDDY/volumes uploads
tar czf /opt/DABUDDY/backup/appdata-$(date +%F).tgz -C /opt/DABUDDY/volumes appdata
```

`volumes/db` nicht im laufenden Betrieb auf Dateiebene sichern — dafür ist der
`pg_dump` oben da (konsistent auch bei laufender Datenbank).

### Restore (Datenbank)

```bash
gunzip -c backup/dabuddy-JJJJ-MM-TT.sql.gz | \
  docker compose exec -T db psql -U "$DB_USER" "$DB_NAME"
```

---

## Hinweise

- **Reverse Proxy**: Die App selbst spricht HTTP auf Port 3000; HTTPS für
  `thesisbuddy.hftm.ch` terminiert die vorgelagerte Infrastruktur. Der Proxy
  sollte `X-Forwarded-Proto`/`X-Forwarded-For` setzen und Uploads bis 50 MB
  zulassen (`client_max_body_size 50m` bei nginx).
- **Firewall**: Port 3000 auf 10.109.1.25 nur für den Reverse Proxy freigeben,
  nicht öffentlich.
- **Session-Cookie**: Das Cookie ist aktuell nicht mit dem `secure`-Flag
  markiert (App kennt nur HTTP hinter dem Proxy). Für eine spätere Härtung:
  `trust proxy` aktivieren und `cookie.secure=true` setzen.
