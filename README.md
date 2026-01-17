Progetto universitario che prevede la progettazione e realizzazione di una base di dati relazionale e di un insieme di API REST per il social network Fotogram, una piattaforma basata sulla condivisione di immagini.

Il progetto copre l’intero ciclo di sviluppo backend: dalla modellazione concettuale dei dati alla realizzazione delle API REST con autenticazione e documentazione Swagger.

Tecnologie utilizzate:
- Node.js + Express
- PostgreSQL
- JWT per autenticazione
- Swagger per documentazione e testing delle API
- pg per l’accesso al database

Funzionalità principali:
- Utenti
    Registrazione e login con username, email e password
    Gestione della sessione tramite JWT
    Inserimento e modifica dell’immagine di profilo
    Ruoli: utente, moderatore, amministratore
- Follow
    Relazione asimmetrica tra utenti (stile Twitter)
    Ricerca utenti per username
    Visualizzazione follower e seguiti
- Post
    Creazione di post con: immagine (max 100 KB) oppure contenuto testuale
    Visualizzazione del feed con paginazione
    Like e unlike ai post
- Moderazione
    Segnalazione (flag) dei post
    Gestione dei post segnalati da parte dei moderatori
    Blocco della creazione di nuovi post per utenti con troppi post moderati
- Profili utente
    Visualizzazione dei dati del profilo
    Lista dei post pubblicati
    Follow / unfollow direttamente dal profilo
  
