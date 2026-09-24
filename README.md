<img width="500" height="500" alt="image" src="https://github.com/user-attachments/assets/74244e67-14ea-4ad4-9a93-3859883aa656" />


# CUP Marche Scraper

Bot Node.js che controlla la disponibilita di appuntamenti sul portale CUP Marche e invia una notifica Telegram quando trova risultati.

## Come funziona

A ogni esecuzione il bot:

1. apre il portale CUP Marche con Puppeteer;
2. accede alla ricerca tramite codice fiscale;
3. inserisce codice fiscale e numero della ricetta elettronica;
4. seleziona l'area `MARCHE`;
5. legge tutte le strutture e unita eroganti disponibili;
6. invia i risultati a Telegram con struttura, unita, comune, tempo di attesa e link alla disponibilita.

I messaggi Telegram usano HTML compatibile e includono link cliccabili.

## Requisiti

- Node.js `24.16`;
- un bot Telegram creato tramite BotFather;
- il token del bot e l'ID della chat destinataria;
- codice fiscale e numero della ricetta elettronica validi.

La versione Node richiesta e indicata nel file `.nvmrc`.

## Configurazione locale

Installa la versione Node del progetto e le dipendenze:

```bash
nvm use
npm install
```

Crea il file `.env` partendo dal modello:

```bash
cp .env.example .env
```

Compila le variabili:

```env
BOT_TOKEN=token_del_bot_telegram
CHAT_ID=id_della_chat
CODICE_FISCALE=codice_fiscale
NRE=numero_ricetta_elettronica
ENV=local
```

Il file `.env` contiene dati sensibili e non deve essere committato.

## Avvio

```bash
npm start
```

Oppure:

```bash
node index.js
```

In ambiente locale, con `ENV=local`, viene inviata anche una notifica quando non ci sono posti disponibili. In produzione il messaggio viene inviato solo quando sono presenti risultati.

## Notifiche duplicate

Il contenuto dei risultati viene trasformato in un fingerprint SHA-256 e salvato nel file `.last-result.sha256`.

Se il risultato della nuova esecuzione e identico a quello precedente, il bot non invia una nuova notifica. Quando il risultato cambia, il messaggio viene inviato e il fingerprint viene aggiornato.

## GitHub Actions

Il workflow in `.github/workflows/main.yml` esegue il controllo ogni cinque minuti e puo essere avviato anche manualmente.

Prima di abilitarlo, configura questi repository secrets:

- `BOT_TOKEN`
- `CHAT_ID`
- `CODICE_FISCALE`
- `NRE`

Al termine di una run con risultato cambiato, GitHub Actions committa e pusha `.last-result.sha256`, in modo che la run successiva possa confrontarlo. Il workflow richiede quindi il permesso `contents: write`.

Le esecuzioni sono serializzate per evitare che due run aggiornino lo stato contemporaneamente.

## Struttura principale

- `index.js`: avvio, configurazione e coordinamento del bot;
- `scraper.js`: navigazione del portale e parsing dei risultati;
- `telegram.js`: invio e suddivisione dei messaggi Telegram;
- `.github/workflows/main.yml`: esecuzione automatica su GitHub Actions;
- `.env.example`: modello delle variabili d'ambiente;
- `.last-result.sha256`: fingerprint persistito dell'ultimo risultato.
