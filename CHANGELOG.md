# Changelog

Tutte le modifiche rilevanti a EasyIPmanager sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).
Il versionamento segue [Semantic Versioning](https://semver.org/lang/it/): `MAJOR.MINOR.PATCH`
— MAJOR per rotture di compatibilità, MINOR per nuove funzionalità, PATCH per bug fix.

---

## [Unreleased] — v1.2.0

### Ottimizzazioni (sessione 2026-03-18)

**Backend**
- **[ALTO] crypto.js — cache chiave scrypt**: `scryptSync` calcolato una sola volta al primo utilizzo (~80-100 ms) invece di rieseguirlo ad ogni `encrypt()`/`decrypt()`
- **[ALTO] scanner.js — Buffer chunks**: sostituita la concatenazione `string +=` (O(n²) GC pressure) con accumulo di `Buffer` chunks; `toString()` una volta sola nel `close` event
- **[ALTO] dns.js — elimina N+1 in generate-ptr**: il loop con una `SELECT` per ogni IP è sostituito da una query + `Set` in memoria + transazione SQLite per gli insert
- **[MEDIO] subnets.js + dns.js — elimina SELECT ridondanti post-INSERT/PUT**: oggetti di risposta costruiti dai dati già in memoria invece di ri-leggere dal DB
- **[MEDIO] db.js — indice su `scan_results.created_at`**: copre `ORDER BY created_at DESC LIMIT 50` nella lista scan
- **[BASSO] dns.js — `VALID_TYPES` come `Set`**: lookup O(1) invece di `Array.includes`

**Frontend**
- **[BUG] Scanner.jsx — fix polling interval**: l'`useEffect` con `[scans, loadScans]` distruggeva e ricreava l'intervallo ad ogni fetch (ogni 3 s); separato in due effect con dipendenze corrette
- **[MEDIO] `src/index.css`**: stili globali spostati dal tag `<style>` runtime di `Layout.jsx`; CSS xterm importato dal pacchetto npm locale invece del CDN (`SSH.jsx`); entrambi caricati staticamente da `main.jsx`
- **[MEDIO] CSS hover classes**: eliminati ~15 handler `onMouseEnter`/`onMouseLeave` con manipolazione DOM diretta (incluso un `querySelector` in `SSH.jsx`) in favore di classi CSS in `index.css`; interessa `IPAM.jsx`, `DNS.jsx`, `SSH.jsx`

### Sicurezza (sessione 2026-03-18 — hardening completo)
- **[CRITICO] Separazione chiavi crittografiche**: `SSH_ENCRYPTION_KEY` è ora **obbligatoriamente separata** da `JWT_SECRET`. Nuovo modulo `lib/config.js` centralizza la gestione dei secrets; in produzione entrambe le variabili sono richieste e devono essere diverse
- **[CRITICO] Eliminazione fallback hardcoded**: `crypto.js` non fallback più a `JWT_SECRET` né a `"dev-insecure-default"`; `sshWs.js` non ha più il proprio `SECRET` duplicato. Un unico punto di verità in `lib/config.js`
- **[ALTO] Protezione SSRF**: nuovo modulo `lib/validateHost.js` blocca `localhost`, `127.x.x.x`, `0.0.0.0`, `169.254.x.x` (AWS/GCP metadata), `::1`, `::` sia in `ssh.js` che in `sshWs.js`. Reti private (10.x, 172.16.x, 192.168.x) restano consentite (è un IPAM)
- **[ALTO] WebSocket ticket monouso**: nuovo modulo `lib/wsTickets.js` + endpoint `POST /api/auth/ws-ticket`. Il JWT **non transita più nell'URL** del WebSocket (era esposto nei log di proxy/nginx). Il ticket è crittograficamente casuale (32 byte), monouso e scade in 30 secondi
- **[MEDIO] JWT hardening**: algoritmo `HS256` esplicito in sign e verify (previene algorithm confusion), expiry ridotta da 12h a 4h
- **[MEDIO] Bcrypt rounds**: aumentati da 10 a 12 (~4x più lento da bruteforce)
- **[MEDIO] Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS` (solo in produzione)
- **[MEDIO] Trust proxy**: `app.set("trust proxy", 1)` per rate-limit corretto dietro nginx/traefik; `sshWs.js` ora usa `X-Forwarded-For` / `X-Real-IP` per IP reale del client
- **[BASSO] Validazione cols/rows SSH**: limitate a range 1–512 e 1–256 rispettivamente (previene DoS via valori assurdi)
- **[BASSO] Errori SSH generici al client**: messaggi come "Permission denied (publickey)" non raggiungono più il browser; solo `"Connessione SSH fallita"` (log completo resta server-side)
- **Env check produzione rafforzato**: `server.js` ora verifica che `SSH_ENCRYPTION_KEY` sia presente E diversa da `JWT_SECRET`

### Corretto (sessione 2026-03-18 — analisi bug)
- **SSH — Race condition connessione duplicata**: due messaggi `connect` in rapida successione potevano aprire due sessioni SSH parallele sulla stessa connessione WebSocket; aggiunto flag `isConnecting` con reset in `conn.on("error")` e `conn.on("close")`
- **SSH — Errore decifrazione non loggato lato server**: il blocco catch del `decrypt` non produceva log; aggiunto `console.error` con host ID per debug operativo (secret mai esposto)
- **SSH — WebSocket non chiuso al logout**: le sessioni SSH restavano aperte se l'utente effettuava il logout; aggiunto `useEffect` su `user` in `SSH.jsx` che chiude tutti i WebSocket e smonta i terminali xterm
- **Scanner — Handle DB ridondante**: `proc.on("close")` creava un secondo handle `db2 = getDb()` inutile (singleton); sostituito con il `db` già in scope nel handler della route
- **Scanner — killTimer non rimuove da `activeScans` se `close` non arriva**: dopo `SIGKILL`, se l'evento `close` del processo non si presenta (raro ma possibile), la voce rimaneva in mappa indefinitamente; aggiunto cleanup di sicurezza dopo 5s
- **DNS — Ricerca record case-sensitive**: cercare "MAIL" non trovava "mail"; la ricerca ora converte sia query che campi in minuscolo prima del confronto
- **DNS — Zona non validata nel form frontend**: il campo zona accettava qualsiasi stringa; aggiunta validazione regex `/^[a-z0-9.-]+$/i` con controllo su punto iniziale/finale
- **DNS — Zona non validata in `generate-ptr` backend**: il parametro `zone` dal body non era controllato; aggiunto check regex prima dell'inserimento
- **CIDR — Prefisso `/0` accettato**: `isValidCIDR` accettava `0.0.0.0/0`; limite inferiore cambiato da 0 a 1
- **API — Nessun timeout sulle richieste fetch**: se il backend non risponde, il client restava appeso indefinitamente; aggiunto `AbortController` con timeout a 15 secondi su tutte le chiamate REST
- **Scanner — Deselezionare subnet sovrascriveva il target manuale**: se l'utente selezionava una subnet (auto-fill CIDR) e poi deselezionava, il target rimaneva il CIDR precedente; ora la deselezione lascia invariato il target

### Corretto (sessione 2026-03-11 — ottimizzazioni)
- **DNS — Sort mutation in render**: `zoneRecords.sort()` mutava l'array originale durante il rendering causando possibili inconsistenze React; sostituito con `[...zoneRecords].sort()`
- **Scanner — crash su `openResult`**: se `api.getScan()` falliva, il modal veniva aperto con `selectedScan` nullo → TypeError; aggiunto try/catch con toast di errore
- **Scanner — chiavi React instabili**: `key={i}` (indice array) nelle liste host sostituito con `key={h.ip}`; evita re-render errati quando la lista viene filtrata o riordinata
- **Scanner — import host con `setImporting`**: la funzione di toggle checkbox ora usa l'updater funzionale `prev =>` invece di catturare il valore di closure, eliminando race condition su click veloci
- **Tema — FOUC (flash bianco al caricamento)**: i token CSS venivano applicati in `useEffect` (dopo il primo paint), causando un breve flash con i colori di default del browser; ora applicati sincronamente nell'initializer di `useState`

### Ottimizzato (sessione 2026-03-11)
- **DNS — `useMemo` su `filtered` e `grouped`**: il filtraggio e il raggruppamento dei record DNS erano ricalcolati ad ogni render; ora dipendono solo da `records`, `selectedZone`, `search`
- **Scanner — output nmap nel DB troncato a 64 KB**: l'output grezzo di nmap (fino a 10 MB) veniva salvato per intero in SQLite; ora vengono conservati solo i primi 64 KB + 4 KB di stderr, sufficiente per il debug senza gonfiare il file
- **DB — pragma SQLite di performance**: aggiunti `synchronous = NORMAL` (sicuro con WAL, più veloce di FULL), `cache_size = -32000` (32 MB di cache pagine), `temp_store = MEMORY` (tabelle temporanee in RAM)

### Aggiunto (sessione 2026-03-17)
- **SSH — Client SSH web**: nuovo tab "SSH" con terminale xterm.js completo nel browser; host salvati con credenziali cifrate AES-256-GCM nel DB; supporto autenticazione password e chiave privata PEM/OpenSSH; sessioni multiple in sub-tab indipendenti con pulsante `+`; connessione diretta senza salvare l'host; WebSocket proxy backend (`ws` + `ssh2`) con verifica JWT e rate limit 10 connessioni/minuto per IP.
- **UI — Versione in sidebar**: il numero di versione è mostrato in basso a sinistra nella sidebar; letto dinamicamente da `GET /api/health` che a sua volta legge `backend/package.json`; aggiornare la versione nel changelog significa aggiornare solo `package.json` e l'app la riflette automaticamente.
- **Scanner — Eliminazione scansioni**: pulsante cestino su ogni scansione completata, abortita o in errore; modale di conferma prima della cancellazione. Nuovo endpoint `DELETE /api/scanner/:id` (blocca con HTTP 409 se la scansione è ancora in corso).

### Aggiunto
- **IPAM — Selezione massiva IP**: checkbox per ogni riga della tabella, "seleziona tutti" nell'header, barra azione con contatore e pulsante *Elimina selezionati* con modale di conferma
- **NetworkLogo unificato**: il logo SVG della schermata di login viene ora mostrato anche nella sidebar interna, estratto come componente condiviso in `UI.jsx` con prop `size`
- **Backend — Validazione CIDR server-side**: `POST /api/subnets` e `PUT /api/subnets/:id` rifiutano con HTTP 400 valori non conformi (es. ottetti > 255, prefisso fuori range)
- **Backend — Validazione IP server-side**: `POST /api/subnets/:id/entries` controlla che l'indirizzo IPv4 sia nel range 0–255 per ogni ottetto
- **Backend — Validazione tipo dispositivo**: `POST /api/subnets/:id/entries` accetta solo i tipi conosciuti (`server`, `router`, `switch`, `workstation`, `printer`, `camera`, `iot`, `other`)
- **Backend — TTL DNS con bounds**: `POST/PUT /api/dns` applica un TTL minimo di 60 s e massimo 2 147 483 647 s (~68 anni); valori fuori range vengono ricondotti al default (3600 s)
- **Backend — Rate limit su `/api/scanner/start`**: massimo 10 richieste/minuto per IP, indipendente dal rate limit globale
- **DB — Indice composito `(subnet_id, ip)`**: velocizza le query `SELECT … WHERE subnet_id=? ORDER BY ip` su subnet con molti IP

### Corretto
- **UI — Bordo chiaro in tema scuro**: il margin di default del browser su `<body>` mostrava una striscia bianca attorno all'app; rimosso con reset CSS in `index.html`
- **IPAM — Colonna Hostname compatta**: rimossi i badge tag inline (es. `scanned`) che aumentavano l'altezza delle righe; il padding verticale delle celle è stato ridotto da 10 px a 7 px
- **Backend — `nmap` non trovato**: aggiunto `proc.on("error")` per gestire il caso in cui `nmap` non sia installato; prima causava crash silenzioso del processo Node
- **Backend — Esaurimento memoria su scan grandi**: stdout/stderr del processo nmap ora vengono troncati a 10 MB; se superati, il risultato include un campo `warning`
- **Backend — `parseScan` crash su JSON corrotto**: il risultato di uno scan viene ora deserializzato in try/catch; record malformati tornano `{ error: "Result parsing failed" }` invece di generare HTTP 500
- **Backend — `parseEntry` crash su tag corrotti**: i tag JSON corrotti nel DB vengono ricondotti ad array vuoto invece di propagare l'eccezione
- **Frontend — `api.js` risposta non-JSON**: se il server restituisce una pagina di errore non JSON (es. reverse proxy), `res.json()` era unhandled; ora restituisce un messaggio leggibile

---

## [1.1.0] — 2025-03-08

### Aggiunto
- **Scanner — Import diretto in IPAM**: i risultati di uno scan nmap possono essere importati come indirizzi IP con un click, con contatore *importati / saltati*
- **IPAM — Mappa grafica IP**: vista a griglia che mostra tutti gli indirizzi di una subnet colorati per stato (assegnato / libero), accessibile dal toggle *Mappa / Tabella*
- **IPAM — Avviso saturazione subnet**: banner arancione/rosso quando una subnet supera l'80 % / 90 % di utilizzo
- **IPAM — Export CSV**: esporta tutti gli IP di una subnet in formato CSV con un click
- **IPAM — Colonne ridimensionabili**: ogni colonna della tabella IP è trascinabile; le larghezze vengono persistite in `localStorage`
- **Auth — Credenziali via env**: `ADMIN_USER` e `ADMIN_PASSWORD` configurabili senza rebuild; il server esce in produzione se `JWT_SECRET` non è impostato
- **NetworkLogo**: logo SVG della schermata di login con nodo centrale e rete perimetrale
- **ResizableTable — Bulk delete**: struttura base per azioni multiple sulle righe (completata in v1.2.0)

### Modificato
- **Tema**: rivisitazione completa — sfondo charcoal `#09090b`, accent emerald `#10b981`, gerarchia testo a 5 livelli; sistema di token CSS centralizzato in `useTheme.jsx`
- **Sidebar logo**: sostituito con gradiente emerald/cyan

### Corretto
- **CORS — Asset statici**: il middleware CORS era applicato globalmente e bloccava il bundle Vite (`403` su file JS/CSS statici)
- **CORS — Chiamate API da origini non-localhost**: riconfigurato per accettare richieste dall'origine del Vite dev server in sviluppo
- **IPAM — Header tabella**: rimosso `overflow: hidden` dalla cella outer che tagliava il testo degli header
- **IPAM — Drag colonne**: aggiunto `userSelect: none` durante il drag; corretto `onMouseLeave` sulle righe che si attivava anche durante il resize
- **DNS — Hover righe**: colore hardcodato `#0f172a` sostituito con `var(--bg-raised)`
- **Scanner — Checkbox / radio**: colori hardcodati sostituiti con variabili CSS `var(--accent-bg)` e `var(--accent)`
- **Scanner — Cleanup poll**: l'interval di polling viene ora cancellato correttamente al dismount del componente
- **utils.js — `isIPInSubnet`**: esclusi correttamente network address e broadcast per subnet con prefisso < 31

---

## [1.0.0] — 2025-02-01

### Aggiunto
- **IPAM**: gestione subnet (CIDR, VLAN, location, descrizione), assegnazione IP con hostname/MAC/tipo/tag/descrizione, ordinamento per IP, modal di conferma eliminazione
- **DNS**: record A, AAAA, CNAME, MX, TXT, PTR, NS, SRV, CAA con gestione per zone, generazione PTR automatica da subnet IPAM
- **Scanner**: scansione rete con nmap in tre modalità (ping sweep, top 100 porte, full scan), timeout automatico 10 minuti, abort manuale, storico scan
- **Auth**: login con JWT (12 h), bcrypt per password, rate limiting su `/api/auth/login` (10 req/15 min), rate limiting globale API (500 req/15 min)
- **Temi**: dark / light / system con token CSS centralizzati, persistito in `localStorage`
- **Deploy Docker**: single-container con `docker compose up -d --build`, volume persistente `ipam_data` per SQLite, `network_mode: host` per accesso rete lab
- **Schema DB**: tabelle `subnets`, `ip_entries`, `dns_records`, `scan_results` con indici su campi chiave; inizializzazione idempotente con `CREATE TABLE IF NOT EXISTS`
