# EasyIPmanager — Lab Network Manager

Tool modulare per la gestione degli indirizzi IP del laboratorio. Self-hosted, deployabile come singolo Docker container.

## Funzionalità

- **IPAM** — Gestione subnet (CIDR), assegnazione IP, visualizzazione saturazione, mappa IP grafica, export CSV, avviso capacità
- **DNS** — Record A, AAAA, CNAME, MX, TXT, PTR, NS, SRV, CAA con gestione per zone, generazione PTR automatica
- **Scanner** — Scansione di rete con nmap (ping sweep, port scan, full scan), import diretto nell'IPAM
- **Auth** — Login con JWT, rate limiting, credenziali via variabili d'ambiente

## Deploy rapido

### 1. Clona il repository

```bash
git clone https://github.com/Warezzo/EasyIPmanager.git
cd EasyIPmanager/ipam
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env
nano .env          # oppure: vim .env / code .env
```

Valori **obbligatori** (il server non si avvia in produzione senza di essi):

```env
JWT_SECRET=<stringa casuale lunga — genera con: openssl rand -hex 32>
ADMIN_PASSWORD=<password sicura>
```

Valori opzionali:

```env
ADMIN_USER=admin          # default: admin
PORT=5050                 # default: 5050
CORS_ORIGINS=http://mio-server:5050   # origini aggiuntive per CORS (opzionale)
```

### 3. Build e avvio

```bash
docker compose up -d --build
```

L'interfaccia sarà disponibile su `http://<ip-server>:5050`

### 4. Aggiornamenti

```bash
git pull
docker compose down
docker compose up -d --build
```

I dati sono persistiti nel volume Docker `ipam_data` (SQLite su `/data/ipam.db`).

---

## Note di sicurezza

- **JWT_SECRET** e **ADMIN_PASSWORD** sono obbligatori in produzione — il server esce se mancanti
- Le credenziali vengono confrontate con bcrypt (constant-time) per prevenire timing attacks
- Il rate limiting è attivo sia sul login (10 req/15min) che su tutte le API (500 req/15min)
- CORS è configurato con whitelist — per ambienti di produzione impostare `CORS_ORIGINS`

---

## Note sul networking per lo scanner

Il `docker-compose.yml` usa `network_mode: host` per permettere allo scanner di raggiungere la rete del laboratorio.
Le capabilities `NET_ADMIN` e `NET_RAW` sono necessarie per nmap/ping.

Se preferisci la modalità bridge (meno privilegiata, lo scanner raggiunge solo la rete del container):

```yaml
# In docker-compose.yml, commenta network_mode: host e decommenta:
networks:
  - lab
```

---

## Struttura del progetto

```
EasyIPmanager/
├── README.md
└── ipam/
    ├── Dockerfile
    ├── docker-compose.yml
    ├── .env.example
    ├── backend/
    │   ├── server.js          # Express entry point
    │   ├── db.js              # SQLite schema + indici
    │   ├── middleware/
    │   │   └── auth.js        # JWT middleware
    │   └── routes/
    │       ├── auth.js        # POST /api/auth/login
    │       ├── subnets.js     # CRUD subnet + IP entries
    │       ├── dns.js         # CRUD DNS records
    │       └── scanner.js     # nmap scanner + import
    └── frontend/
        └── src/
            ├── main.jsx
            ├── pages/
            │   ├── IPAM.jsx
            │   ├── DNS.jsx
            │   └── Scanner.jsx
            ├── components/
            │   ├── Layout.jsx
            │   └── UI.jsx
            ├── hooks/
            │   ├── useAuth.jsx
            │   └── useTheme.jsx
            └── lib/
                ├── api.js
                └── utils.js
```

---

## Estendere il progetto

1. **Backend** — aggiungi un file in `backend/routes/` e registralo in `server.js`
2. **Frontend** — aggiungi una pagina in `frontend/src/pages/` e aggiungila alla sidebar in `Layout.jsx`
3. **DB** — aggiungi tabelle in `db.js` dentro `initSchema()`

Idee per moduli futuri:
- DHCP ranges (con stato leases)
- Asset inventory
- Network topology map
- Alerting su IP duplicati / soglie di saturazione
- Export zone BIND/dnsmasq
