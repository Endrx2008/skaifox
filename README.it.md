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

## Memoria condivisa (SKAI_ Memory)

Come le altre app SKAI, SKAI per Firefox usa **SKAI_ Memory**, la memoria condivisa da tutte le app SKAI
(arriva con [sk_notes](https://github.com/Endrx2008/sk_notes)). Prima di rispondere SKAI cerca cosa sanno le
altre app del tuo messaggio (per esempio un appuntamento visto in sk_mail); dopo la risposta tiene un breve
appunto dello scambio nelle sue note (`plugins/skaifox/`), che le altre app possono leggere.

Un componente di Firefox non può leggere file da solo, quindi serve il piccolo pacchetto **skaifox-memory**
(`skaifox-memory_<versione>_all.deb` nella release, `packaging/arch/PKGBUILD` per Arch, oppure
`sudo sh native/install.sh`): vedi [native/README.md](native/README.md). Per scrivere nella memoria l'utente
deve essere nel gruppo `skai`. Senza il pacchetto o senza sk_notes il componente funziona come prima.

## Sviluppo

Per caricare i sorgenti senza impacchettarli: `about:debugging` → **Questo Firefox** → **Carica componente
aggiuntivo temporaneo** → il `manifest.json` di questo repository.

```sh
python3 tools/build_xpi.py      # → dist/skai@skorpion.xpi (non firmato)
sh tools/build_deb.sh           # → dist/skaifox-memory_<versione>_all.deb
```

Firefox normale installa solo componenti firmati da Mozilla: il `.xpi` della release è quello firmato (per
esempio `npx web-ext sign --channel=unlisted` con le tue chiavi API di addons.mozilla.org).

| Percorso | Cos'è |
|---|---|
| `manifest.json` | manifest WebExtension (versione 2) |
| `src/shared/constants.js` | indirizzo di Ollama, tempi di attesa, prompt di sistema, motori di ricerca |
| `src/shared/ollama.js` | client di Ollama (scelta del modello, streaming) |
| `src/shared/memory.js` | SKAI_ Memory tramite il programma nativo |
| `src/background/background.js` | esegue le azioni, tiene la cronologia |
| `src/content/content.js` | legge le pagine |
| `src/sidebar/` | la barra laterale |
| `_locales/en`, `_locales/it` | i testi del componente |
| `native/` | il programma nativo `skaifox-memory-host` e il suo manifest per Firefox |
| `tools/build_xpi.py` | crea il `.xpi` |
| `tools/build_deb.sh`, `packaging/arch/` | creano il pacchetto `skaifox-memory` (Debian / Arch) |

## Licenza

GPL-3.0-or-later, vedi [LICENSE](LICENSE). © 2026 Enrico Miot (EndrX), fondatore e manutentore di Skorpion OS.
