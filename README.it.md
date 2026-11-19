# skaifox — SKAI per Firefox

Un componente aggiuntivo di Firefox per [Skorpion OS](https://github.com/Endrx2008/skorpion_os): **SKAI** in
una barra laterale che cerca sul web, apre e legge pagine ed esegue piccole sequenze di schede al posto
tuo. *English: [README.md](README.md).*

## Installazione

Scarica `skai@skorpion.xpi` dall'[ultima release](https://github.com/Endrx2008/skaifox/releases/latest)
(firmato da Mozilla), poi in Firefox apri **Componenti aggiuntivi e temi → icona a ingranaggio → Installa
componente aggiuntivo da file** e selezionalo. Serve Firefox 109 o successivo.

Apri o chiudi la barra laterale con il pulsante 🦂 nella barra degli strumenti, oppure **Visualizza →
Barra laterale → SKAI**. La barra laterale parla la lingua di Firefox (italiano o inglese); SKAI risponde
nella lingua in cui scrivi.

## Come funziona

Scrivi nella barra laterale; SKAI risponde con un'azione JSON che il componente controlla ed esegue:

| Azione | Cosa fa |
|---|---|
| `reply_chat` | risponde nella chat |
| `search` | cerca su Google, DuckDuckGo o Brave in una nuova scheda |
| `open_tab` / `navigate` | apre un sito in una nuova scheda / in quella attuale |
| `read_page` | legge e riassume una pagina |
| `close_tab` | chiude le schede di un argomento |
| `notify` | mostra una notifica |
| `workflow` | più azioni tra queste, una dopo l'altra |

Le schede aperte da SKAI sono raggruppate per argomento (al massimo 10).

## SKAI

Il componente parla con Ollama in locale (`http://localhost:11434`) e usa il modello installato con più
parametri. Senza Ollama o senza un modello la barra laterale mostra lo stesso messaggio «Le funzioni IA sono
disattivate» di tutti gli strumenti SKAI. Una risposta non ha limiti di tempo: se il modello è lento compare
solo un avviso con il pulsante **Interrompi**. Dal computer escono solo le ricerche e le pagine che apri tu o
SKAI. In Skorpion OS Ollama e il modello arrivano dalla procedura guidata di SKAI, e SKAI Manager
(Alt + F9) li cambia.

## Sviluppo

Per caricare i sorgenti senza impacchettarli: `about:debugging` → **Questo Firefox** → **Carica componente
aggiuntivo temporaneo** → il `manifest.json` di questo repository.

```sh
python3 tools/build_xpi.py      # → dist/skai@skorpion.xpi (non firmato)
```

Firefox normale installa solo componenti firmati da Mozilla: il `.xpi` della release è quello firmato (per
esempio `npx web-ext sign --channel=unlisted` con le tue chiavi API di addons.mozilla.org).

| Percorso | Cos'è |
|---|---|
| `manifest.json` | manifest WebExtension (versione 2) |
| `src/shared/constants.js` | indirizzo di Ollama, tempi di attesa, prompt di sistema, motori di ricerca |
| `src/shared/ollama.js` | client di Ollama (scelta del modello, streaming) |
| `src/background/background.js` | esegue le azioni, tiene la cronologia |
| `src/content/content.js` | legge le pagine |
| `src/sidebar/` | la barra laterale |
| `_locales/en`, `_locales/it` | i testi del componente |
| `tools/build_xpi.py` | crea il `.xpi` |

## Licenza

GPL-3.0-or-later, vedi [LICENSE](LICENSE). © 2026 Enrico Miot (EndrX), fondatore e manutentore di Skorpion OS.
