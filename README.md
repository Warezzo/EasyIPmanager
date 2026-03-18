# EasyIPmanager — Lab Network Manager

Tool modulare per la gestione della rete di laboratorio. Self-hosted, deployabile come singolo container Docker. Versione corrente: **v1.2.0**

---

## Funzionalità

| Modulo | Funzionalità |
|--------|-------------|
| **IPAM** | Gestione subnet (CIDR), assegnazione IP con hostname/MAC/tipo/tag, mappa grafica a griglia, avvisi saturazione (80%/90%), export CSV, eliminazione massiva |
| **DNS** | Record A, AAAA, CNAME, MX, TXT, PTR, NS, SRV, CAA — gestione per zone, generazione PTR automatica da subnet IPAM, ricerca |
| **Scanner** | Scansione di rete con nmap: ping sweep, top-100 porte, full scan — timeout 10 min, abort manuale, import diretto nell'IPAM, storico ultimi 50 scan |
| **SSH** | Client SSH web completo (xterm.js) — host con credenziali cifrate AES-256-GCM, autenticazione password e chiave privata PEM/OpenSSH, sessioni multi-tab |
| **Auth** | Login JWT (4h), bcrypt rounds 12, rate limiting, credenziali via variabili d'ambiente, tema dark/light/system |

---

## Prerequisiti

- **Docker** ≥ 24 con il plugin **Docker Compose**
- **`make`** — per i comandi Makefile (opzionale ma raccomandato)
- **`openssl`** — per la generazione automatica dei secret (disponibile su qualsiasi Linux/macOS)
- Le capability `NET_ADMIN` e `NET_RAW` sono necessarie per nmap/ping e vengono abilitate automaticamente dal `docker-compose.yml`

---

## Deploy

### Opzione A — Setup guidato (raccomandato)

```bash
git clone https://github.com/Warezzo/EasyIPmanager.git
cd EasyIPmanager
make setup
```

Lo script interattivo:
1. Crea `ipam/.env` da `.env.example`
2. Genera automaticamente `JWT_SECRET` e `SSH_ENCRYPTION_KEY` con `openssl rand -hex 32`
3. Chiede di impostare `ADMIN_PASSWORD` (min 8 caratteri, con conferma)
4. Chiede l'username admin (default: `admin`)
5. Avvia il container scaricando l'immagine da GHCR

Al termine l'interfaccia è disponibile su `http://<ip-server>:5050`.

---

### Opzione B — Manuale

```bash
git clone https://github.com/Warezzo/EasyIPmanager.git
cd EasyIPmanager/ipam

# Crea il file di configurazione
cp .env.example .env
```

Modifica `ipam/.env` con i valori obbligatori:

```env
# Genera con: openssl rand -hex 32
JWT_SECRET=<stringa_casuale_lunga>

# Deve essere DIVERSA da JWT_SECRET — genera con: openssl rand -hex 32
SSH_ENCRYPTION_KEY=<altra_stringa_casuale_lunga>

# Password dell'utente admin
ADMIN_PASSWORD=<password_sicura>
```

Poi, dalla root del repository:

```bash
make deploy
```

---

## Variabili d'ambiente

Tutte le variabili si impostano nel file `ipam/.env`.

### Obbligatorie in produzione

Il server **non si avvia** se una di queste manca (esce con FATAL):

| Variabile | Descrizione | Come generare |
|-----------|-------------|---------------|
| `JWT_SECRET` | Firma i token JWT di sessione | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Password dell'utente admin | Sceglila tu (min 8 caratteri) |
| `SSH_ENCRYPTION_KEY` | Cifra le credenziali SSH nel DB (AES-256-GCM). **Deve essere diversa da `JWT_SECRET`** | `openssl rand -hex 32` |

### Opzionali

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `ADMIN_USER` | `admin` | Username per il login |
| `PORT` | `5050` | Porta su cui è esposta l'interfaccia |
| `DB_PATH` | `/data/ipam.db` | Path del database SQLite all'interno del container |
| `NODE_ENV` | `production` | Impostato automaticamente dall'immagine Docker |

---

## Comandi Makefile

Tutti i comandi vanno eseguiti dalla **root del repository**.

```
make help       # mostra questa lista
```

| Comando | Descrizione |
|---------|-------------|
| `make setup` | Setup guidato interattivo: crea `.env`, genera i secret, avvia il container |
| `make deploy` | Scarica l'immagine da GHCR e avvia il container (richiede che `.env` esista) |
| `make update` | Aggiorna all'immagine più recente e riavvia il container |
| `make restart` | Riavvia il container senza rebuilding (utile dopo modifiche a `.env`) |
| `make stop` | Ferma e rimuove il container (il volume dati è preservato) |
| `make destroy` | **Irreversibile** — ferma il container E cancella il volume dati |
| `make logs` | Segue i log del container in tempo reale (Ctrl+C per uscire) |
| `make status` | Mostra stato del container e info sull'immagine |
| `make shell` | Apre una shell interattiva dentro il container in esecuzione |
| `make backup` | Copia il database SQLite in `./backups/ipam_TIMESTAMP.db` |

---

## Aggiornamenti

```bash
make update
```

Esegue il pull dell'immagine `ghcr.io/warezzo/easyipmanager:latest` e riavvia il container. Il volume `ipam_data` con il database SQLite viene preservato.

---

## Backup e ripristino

### Backup

```bash
make backup
# Salva in: ./backups/ipam_20260318_143022.db
```

### Ripristino

```bash
# Ferma il container
make stop

# Copia il backup nel volume
docker run --rm \
  -v ipam_data:/data \
  -v "$(pwd)/backups:/backups" \
  alpine sh -c "cp /backups/ipam_TIMESTAMP.db /data/ipam.db"

# Riavvia
make deploy
```

---

## CI/CD — Pubblicazione automatica su GHCR

Il workflow `.github/workflows/docker-publish.yml` costruisce e pubblica automaticamente l'immagine Docker su GitHub Container Registry.

**Trigger:**
- Push sul branch `main` → pubblica il tag `:latest`
- Push di un tag semver `v*.*.*` → pubblica `:v1.2.3`
- Ogni push → pubblica anche `:sha-abc1234` per la tracciabilità

**Immagine prodotta:** `ghcr.io/warezzo/easyipmanager`

**Action versions usate:** `checkout@v4`, `login-action@v4`, `metadata-action@v6`, `setup-buildx-action@v4`, `build-push-action@v7` (con GHA cache v2)

### Prerequisito GitHub

Prima che il workflow possa pubblicare su GHCR, abilita i permessi nel repository:

```
Settings → Actions → General → Workflow permissions
→ seleziona "Read and write permissions"
→ Save
```

---

## Networking per lo Scanner

Il `docker-compose.yml` usa `network_mode: host` per permettere allo scanner nmap di raggiungere direttamente la rete del laboratorio. Le capability `NET_ADMIN` e `NET_RAW` sono necessarie per il ping sweep.

### Modalità host (default)

```yaml
network_mode: host
cap_add:
  - NET_ADMIN
  - NET_RAW
```

Lo scanner accede a tutta la rete del host. La direttiva `ports:` è ignorata da Docker in questa modalità — la porta viene controllata solo dalla variabile `PORT`.

### Modalità bridge (meno privilegiata)

Se preferisci isolare il container, modifica `ipam/docker-compose.yml`:

```yaml
# Commenta network_mode: host
# network_mode: host

# Decommenta la sezione networks
networks:
  - lab

# networks:
#   lab:
#     driver: bridge
```

In modalità bridge lo scanner raggiunge solo la rete interna del container, non la rete del laboratorio.

---

## Note di sicurezza

### Chiavi crittografiche

- `JWT_SECRET` e `SSH_ENCRYPTION_KEY` devono essere **stringhe distinte** — il server esce se sono uguali
- `SSH_ENCRYPTION_KEY` cifra le credenziali SSH nel database con AES-256-GCM
- Non usare mai valori di default in produzione

### Protezione SSRF

Il backend blocca connessioni SSH verso indirizzi locali: `localhost`, `127.x.x.x`, `0.0.0.0`, `169.254.x.x` (metadata cloud), `::1`, `::`. Le reti private (10.x, 172.16.x, 192.168.x) sono consentite — è un IPAM.

### WebSocket SSH

Il token JWT non transita mai nell'URL del WebSocket (sarebbe esposto nei log di proxy/nginx). Viene invece usato un **ticket monouso** (32 byte casuali, valido 30 secondi) emesso da `POST /api/auth/ws-ticket`.

### Rate limiting

| Endpoint | Limite |
|----------|--------|
| `POST /api/auth/login` | 10 richieste / 15 min per IP |
| Tutte le API | 500 richieste / 15 min per IP |
| `POST /api/scanner/start` | 10 richieste / min per IP |
| WebSocket SSH | 10 connessioni / min per IP |

### Security headers

Applicati su tutte le risposte: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (disabilita camera/mic/geolocation), `Strict-Transport-Security` (solo in produzione).

---

## API REST — Riferimento rapido

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login — restituisce il JWT |
| `POST` | `/api/auth/ws-ticket` | Emette un ticket monouso per WebSocket SSH |
| `GET` | `/api/health` | Health check con versione |
| `GET/POST` | `/api/subnets` | Lista o crea subnet |
| `GET/PUT/DELETE` | `/api/subnets/:id` | Legge, modifica o elimina una subnet |
| `GET/POST` | `/api/subnets/:id/entries` | IP entries di una subnet |
| `GET/PUT/DELETE` | `/api/subnets/:id/entries/:eid` | Singola IP entry |
| `GET/POST` | `/api/dns` | Lista o crea record DNS |
| `GET/PUT/DELETE` | `/api/dns/:id` | Singolo record DNS |
| `POST` | `/api/dns/generate-ptr` | Genera record PTR da subnet IPAM |
| `POST` | `/api/scanner/start` | Avvia una scansione nmap |
| `GET` | `/api/scanner` | Ultimi 50 scan |
| `GET/DELETE` | `/api/scanner/:id` | Risultato o cancellazione scan |
| `GET/POST` | `/api/ssh` | Lista o crea host SSH |
| `PUT/DELETE` | `/api/ssh/:id` | Modifica o elimina host SSH |
| `WebSocket` | `/ws/ssh` | Terminale SSH in tempo reale |

---

## Struttura del progetto

```
EasyIPmanager/
├── README.md
├── CHANGELOG.md
├── Makefile                        # Comandi deploy (setup, deploy, update, backup…)
│
└── ipam/
    ├── Dockerfile                  # node:20-alpine + nmap + build frontend + serve backend
    ├── docker-compose.yml          # Singolo servizio con volume, env, host network
    ├── .env.example                # Template variabili d'ambiente
    ├── .dockerignore
    ├── setup.sh                    # Script setup guidato (chiamato da make setup)
    │
    ├── backend/
    │   ├── server.js               # Express entry point: middleware, routes, WebSocket, avvio
    │   ├── db.js                   # Schema SQLite, pragma performance, indici, singleton
    │   ├── package.json            # v1.2.0 — express, better-sqlite3, bcryptjs, jsonwebtoken, ssh2, ws
    │   │
    │   ├── lib/
    │   │   ├── config.js           # Centralizza JWT_SECRET e SSH_ENCRYPTION_KEY
    │   │   ├── crypto.js           # AES-256-GCM con cache chiave scrypt
    │   │   ├── validateHost.js     # Protezione SSRF: blocca indirizzi locali/metadata
    │   │   └── wsTickets.js        # Ticket monouso per autenticazione WebSocket SSH
    │   │
    │   ├── middleware/
    │   │   └── auth.js             # Verifica JWT, helper signToken/requireAuth
    │   │
    │   └── routes/
    │       ├── auth.js             # POST /api/auth/login + /ws-ticket
    │       ├── subnets.js          # CRUD subnet + IP entries
    │       ├── dns.js              # CRUD DNS records + generate-ptr
    │       ├── scanner.js          # Wrapper nmap: avvio, status, risultati, delete
    │       ├── ssh.js              # CRUD host SSH cifrati
    │       └── sshWs.js            # Proxy WebSocket → SSH (ticket auth, xterm resize)
    │
    └── frontend/
        └── src/
            ├── main.jsx            # Entry point React: init tema, CSS globale, xterm CSS
            ├── index.css           # Stili globali: reset, token tema, hover, xterm
            ├── components/
            │   ├── Layout.jsx      # Sidebar, navigazione, toggle tema, versione
            │   └── UI.jsx          # Componenti riusabili: NetworkLogo, modal, tabelle
            ├── hooks/
            │   ├── useAuth.jsx     # State autenticazione, login/logout, JWT in localStorage
            │   └── useTheme.jsx    # Tema dark/light/system con token CSS
            ├── pages/
            │   ├── Login.jsx       # Form autenticazione
            │   ├── IPAM.jsx        # Subnet + IP: tabella, mappa, CSV, bulk delete
            │   ├── DNS.jsx         # Record DNS per zone, CRUD, ricerca
            │   ├── Scanner.jsx     # Avvio scan, polling, risultati, import in IPAM
            │   └── SSH.jsx         # Host SSH, terminale xterm.js, multi-tab
            └── lib/
                ├── api.js          # Fetch wrapper: JWT header, timeout 15s, errori
                └── utils.js        # Validazione IP/CIDR, utilità
```

---

## Estendere il progetto

1. **Backend** — aggiungi un file in `backend/routes/` e registralo in `server.js` con `app.use("/api/nuovo", ...)`.
2. **Frontend** — aggiungi una pagina in `frontend/src/pages/` e inseriscila nella sidebar in `Layout.jsx`.
3. **DB** — aggiungi tabelle in `db.js` dentro `initSchema()` usando `CREATE TABLE IF NOT EXISTS` (idempotente).

### Idee per moduli futuri

- DHCP ranges con stato dei lease
- Asset inventory (hardware/software)
- Mappa topologica della rete
- Alerting su IP duplicati o soglie di saturazione
- Export zone in formato BIND / dnsmasq
