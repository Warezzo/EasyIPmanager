# IPAM — Lab Network Manager

Tool modulare per la gestione degli indirizzi IP del laboratorio. Ospitabile come singolo Docker container.

## Funzionalità

- **IPAM**: Gestione subnet (CIDR), assegnazione IP, visualizzazione saturazione, mappa IP grafica
- **DNS**: Record A, AAAA, CNAME, MX, TXT, PTR, NS, SRV, CAA con gestione per zone, generazione PTR automatica
- **Scanner**: Scansione di rete con nmap (ping sweep, port scan, full scan), import diretto nell'IPAM
- **Auth**: Login con JWT, rate limiting, credenziali via variabili d'ambiente

## Deploy

### 1. Clona / copia il progetto

```bash
cp -r ipam/ /opt/ipam
cd /opt/ipam
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env
# Modifica .env con le tue credenziali
nano .env
```

Valori obbligatori:
```env
JWT_SECRET=<stringa casuale lunga, es: openssl rand -hex 32>
ADMIN_PASSWORD=<password sicura>
ADMIN_USER=admin          # opzionale, default: admin
PORT=3000                  # opzionale
```

### 3. Build e avvio

```bash
docker compose up -d --build
```

Il tool sarà disponibile su `http://<ip-server>:5050`

### 4. Aggiornamenti

```bash
docker compose down
docker compose up -d --build
```

I dati sono persistiti nel volume Docker `ipam_data` (SQLite su `/data/ipam.db`).

## Note sul networking per lo scanner

Il `docker-compose.yml` usa `network_mode: host` per permettere all'scanner di raggiungere la rete del laboratorio.
Le capabilities `NET_ADMIN` e `NET_RAW` sono necessarie per nmap/ping.

Se preferisci la modalità bridge (meno privilegiata ma lo scanner raggiunge solo la rete del container):
```yaml
# In docker-compose.yml, commenta network_mode: host e decommenta:
networks:
  - lab
```

## Struttura del progetto

```
ipam/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── server.js          # Express entry point
│   ├── db.js              # SQLite schema
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   └── routes/
│       ├── auth.js        # POST /api/auth/login
│       ├── subnets.js     # CRUD subnet + IP entries
│       ├── dns.js         # CRUD DNS records
│       └── scanner.js     # nmap scanner + import
└── frontend/
    └── src/
        ├── main.jsx       # Router + AuthProvider
        ├── pages/
        │   ├── IPAM.jsx   # Pagina principale
        │   ├── DNS.jsx    # Gestione DNS
        │   └── Scanner.jsx# Scanner di rete
        ├── components/
        │   ├── Layout.jsx # Sidebar + navigazione
        │   └── UI.jsx     # Componenti condivisi
        ├── hooks/
        │   └── useAuth.js # Auth context
        └── lib/
            ├── api.js     # Client API REST
            └── utils.js   # Utility IP/CIDR
```

## Aggiungere nuovi moduli

Il progetto è strutturato per essere facilmente estendibile:

1. **Backend**: aggiungi un file in `backend/routes/` e registralo in `server.js`
2. **Frontend**: aggiungi una pagina in `frontend/src/pages/` e aggiungila alla sidebar in `Layout.jsx`
3. **DB**: aggiungi le tabelle necessarie in `db.js` nella funzione `initSchema()`

Esempi di moduli futuri:
- DHCP ranges (con stato leases)
- Asset inventory
- Network topology map
- Alerting su IP duplicati
- Export BIND/dnsmasq
