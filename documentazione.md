# Documentazione per il progetto Fotogram
* Studente: Giorgia Fontana
* Matricola: 43206A

## Progettazione Concettuale
Considerare il seguente diagramma ER
<img src="ER.png" width="800"/>

### Scelte progettuali
* chiave di POST composta data_creazione e username dell'utente che ha creato il post perché un utente può pubblicare una volta nella giornata
* chiave UTENTE username preferibile a email

### Vincoli aggiuntivi
1. Un utente per essere un moderatore deve avere per forza una data_inizio_mod
2. Un utente se è amministratore per forza deve essere un moderatore e quindi avere la data_inzio_mod uguale a quando è diventato amministratore
3. Un post deve essere per forza o immagine o Testo, non può essere entrambe
4. La data di moderazione del post deve essere per forza successiva o uguale alla data_creazione del post
5. Se il post viene moderato deve esserci sia l'utente moderatore che la data_moderazione
6. L'utente non può seguire o essere seguito da se stesso
7. L'utente non moderatore non può visualizzare i post moderati e mettere like o flag
8. Se l'utente elimina il proprio account verranno eliminati anche i suoi post, i suoi like e flag e verrà rimosso da tutte le liste dei suoi seguiti e follower ma se l'utente è un moderatore i post che ha moderato rimarranno moderati
9. Le immagini saranno soltanto locali e nella cartella resources
10. Le immagini sia di profilo che per i post devono avere massimo la dimensione di 100kb
11. Se l'utente ha almeno 3 post moderati negli ultimi 30 giorni non può pubblicare nessun post


## Progettazione logica (Ristrutturazione)
Sono descritte le modifiche al progetto per ciascuna delle fasi della ristrutturazione dello schema ER
<img  src="ER_ristrutturato.png"  width="800"/>

### Ridondanze
* Non serve che il POST abbia il numero di like e numero di flag perchè questi attributi dovrebbero essere sempre ricalcolati prima di mostrarli agli utenti perchè cambiano molto spesso quindi ci sarebbe sempre una lettura in entrambi i casi - non conviene. 
* Non serve che UTENTE abbia il numero di seguiti e numero di follower perchè questi attributi dovrebbero essere sempre ricalcolati prima di mostrarli agli utenti perchè cambiano molto spesso quindi ci sarebbe sempre una lettura in entrambi i casi - non conviene. 

### Eliminazione delle gerarchie:
* La gerarchia di POST viene eliminata accorpando le entità figlie all'entità genitore perché gli accessi a entità genitore e figlie sono contestuali, la generalizzazione è totale e non ci sono associazioni che coinvolgono le sole entità figlie. Vengono aggiunti gli attributi: tipo boolean, URL text, e contenuto text a POST
* La gerarchia di UTENTE viene eliminata accorpando le entità figlie all'entità genitore perchè gli accessi a entità genitore e figlie sono contestuali, la generalizzazione è totale e non ci sono associazioni che coinvolgono le sole entità figlie. Vengono aggiunti gli attributi: amministratore boolean, moderatore boolean e data_inizio_mod date all'entità UTENTE

### Scelte degli identificatori principali
* per POST si produce chiave artificiale per evitare la doppia chiave composta da username_creatore (chiave esterna di UTENTE) e data_creazione
* per CLIENTE si conferma username

## Progettazione logica (Modello Relazionale)

legenda: __chiave primaria__, *chiave esterna*, **attributi unici**, --permette null--

* cliente(_username_, **email**, password, --img_profilo--, --data_inizio_mod--, amministratore, moderatore, --sessID--)
Si è aggiunto sessID per gestire l'autenticazione.

* film(__id__, *username_utente*, data_creazione, tipo_testo, --contenuto--, --URL--, --username_moderatore--, --data_moderazione--)
* foreign key (username_utente) references utente (username)
* foreign key (username_moderatore) references utente (username)

* like (__username_utente__, __id_post__)
* foreign key (username_utente) references utente (username)
* foreign key (id_post) references post (id)

* flag (__username_utente__, __id_post__)
* foreign key (username_utente) references utente (username)
* foreign key (id_post) references post (id)

* seguire (__username_seguito__, __username_seguitore__)
* foreign key (username_seguito) references utente (username)
* foreign key (username_seguitore) references utente (username)

## Progettazione API e query corrispondenti
Utenti inseriti:
1. gio
2. marta
3. davide
4. wiky

Di seguito gli endpoint principali:

### Endpoint /register

#### POST
Registra utente

Request body:
{
"username": "string",
"emai": "string", 
"password_account": "string"
}

Queries:
` INSERT INTO utente (username, email, password_account) VALUES ($1, $2, $3);`

Responses:
* 200, se la creazione dell'account è andata a buon fine quindi utente inserito nel database
* 400, se mancano parametri o non sono validi
* 500, se fallisce la query


### Endpoint /login

#### POST

Collega utente

Request body:
{
"username": "string",
"password_account": "string"
}

Queries:
`SELECT password_account FROM utente WHERE username = $1;`
`UPDATE utente SET sessid = $1 WHERE username = $2;`

Responses:
* 200, restituisce token e refresh token, memorizza sessid nel db
* 400, se mancano parametri o non sono validi
* 401, se username non esiste o password_account non valida
* 500, se fallisce la query


### Endpoint /logout

#### POST

Scollega utente

Headers:
* bearer (string)

Queries:
`UPDATE utente SET sessid = NULL WHERE username = $1;`

Responses:
* 200, utente scollegato
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query


### Endpoint /refresh

#### POST

Rinfresca il token

Headers:
* bearer (string)

Request body:
{
"refresh": "string"
}

Queries:
`SELECT sessid FROM utente WHERE username = $1;`
`UPDATE utente SET sessid = $1 WHERE username = $2;`

Responses:
* 200, aggiornamento sessid 
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query


### Endpoint /utenti

#### GET

Recupera lista degli utenti filtrati per username

Headers:
* bearer (string)

Parameters:
* q (string) - match parziale o completo
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f follower, 0) AS follower
FROM utente u
LEFT JOIN (
SELECT username_seguitore, COUNT(*) AS seguiti
FROM seguire
GROUP BY username_seguitore ) s ON s.username_seguitore = u.username
LEFT JOIN (
SELECT username_seguito, COUNT(*) AS follower
FROM seguire
GROUP BY username_seguito) f ON f.username_seguito = u.username
WHERE u.username LIKE $1
LIMIT $2 OFFSET $3;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query


### Endpoint /utenti/{username}

#### GET

Recupera informazioni dell'utente

Headers:
* bearer (string)

Queries:
`SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
FROM utente u
LEFT JOIN (
SELECT username_seguitore, COUNT(*) AS seguiti
FROM seguire
GROUP BY username_seguitore) s ON s.username_seguitore = u.username
LEFT JOIN (
SELECT username_seguito, COUNT(*) AS follower
FROM seguire
GROUP BY username_seguito) f ON f.username_seguito = u.username
WHERE u.username = $1;`

Responses:
* 200, restituisce risultato
* 400, token non presente o malformato
* 401, token non valido
* 404, username non esiste
* 500, se fallisce la query

#### PATCH

L'amministratore modifica utente rendendolo moderatore

Headers:
* bearer (string)

Queries:
`SELECT amministratore FROM utente WHERE username=$1`
`UPDATE utente SET moderatore = true, data_inizio_mod = CURRENT_DATE WHERE username = $1;`

Responses:
* 200, l'utente è diventato un moderatore
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 403, operazione non permessa perchè solo l'amministratore può fare questa operazione 
* 500, se fallisce la query


### Enpoint /utenti/:username/imgProfilo

#### GET

Recupera immagine profilo utente

Headers:
* bearer (string)

Query: 
`SELECT img_profilo FROM utente WHERE username = $1;`

Responses:
* 200, restituisce immagine jpeg
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 404, immagine profilo non esiste
* 500, se fallisce la query


### Endpoint /profilo

#### GET

Recupera informazioni profilo utente

Headers:
* bearer (string)

Queries:
`SELECT u.username, u.email, COUNT (DISTINCT s.username_seguito) as seguiti, COUNT (DISTINCT s2.username_seguitore) as follower
FROM utente u LEFT JOIN seguire s ON s.username_seguitore=u.username
LEFT JOIN seguire s2 ON s2.username_seguito=u.username
WHERE u.username=$1
GROUP BY u.username, u.email;`

Responses:
* 200, restituisce dati profilo
* 400, token non presente o malformato
* 401, token non valido
* 404, utente non trovato
* 500, se fallisce la query

#### PATCH

Modifica profilo utente (email o password)

Headers:
* bearer (string)

Request body:
{
"email": "string",			
"password_account":"string"
}

Queries:
`UPDATE utente
SET ${updates.join(', ')}
WHERE username = $${index} `

Responses:
* 200, profilo aggiornato con i nuovi dati
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query

#### DELETE

Elimina profilo utente 

Headers:
* bearer (string)

Queries:
`DELETE FROM utente WHERE username=$1`

Responses:
* 200, profilo eliminato
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query


### Endpoint /profilo/seguiti

#### GET

Recupera gli utenti che segui

Headers:
* bearer (string)

Parameters:
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
FROM utente u
LEFT JOIN (
SELECT username_seguitore, COUNT(*) AS seguiti
FROM seguire
GROUP BY username_seguitore) s ON s.username_seguitore = u.username
LEFT JOIN (
SELECT username_seguito, COUNT(*) AS follower
FROM seguire
GROUP BY username_seguito) f ON f.username_seguito = u.username
WHERE u.username IN (SELECT username_seguito FROM seguire WHERE username_seguitore=$1)
ORDER BY u.username ASC;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query

#### POST

Segui un altro utente

Headers:
* bearer (string)

Parametri:
* username (string) - match completo

Queries:
`INSERT INTO seguire (username_seguito, username_seguitore) VALUES ($1, $2);`

Responses:
* 200, segui l'utente
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query


### Endpoint /profilo/seguiti/{username}

#### DELETE

Non segui più un utente

Headers:
* bearer (string)

Queries:
`SELECT username_seguito FROM seguire WHERE username_seguitore=$1 AND username_seguito=$2`
`DELETE FROM seguire WHERE username_seguitore=$1 AND username_seguito=$2`

Responses:
* 200, rimosso utente dai seguiti
* 400, token non presente o malformato
* 401, token non valido
* 404, username non esiste
* 500, se fallisce la query


### Endpoint /profilo/follower

#### GET

Recupera gli utenti (con queste informazioni: username, email, numSeguiti, numFollower, link per andare nell'endpoint per visualizzare imgProfilo) che ti seguono

Headers:
* bearer (string)

Parameters:
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT u.username, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
FROM utente u
LEFT JOIN (
SELECT username_seguitore, COUNT(*) AS seguiti
FROM seguire
GROUP BY username_seguitore) s ON s.username_seguitore = u.username
LEFT JOIN (
SELECT username_seguito, COUNT(*) AS follower
FROM seguire
GROUP BY username_seguito) f ON f.username_seguito = u.username
WHERE u.username IN (SELECT username_seguitore FROM seguire WHERE username_seguito=$1)
ORDER BY u.username ASC;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 500, se fallisce la query


### Endpoint /profilo/imgProfilo

#### POST

Carica o modifica immagine profilo

Headers:
* bearer (string)

Parameters:
* pimage (multipart/form-data, immagine jpg)

Queries:
`UPDATE utente SET img_profilo = $1 WHERE username = $2;`

Responses:
* 200, immagine caricata 
* 400, token non presente o malformato, o parametro non presente
* 401, token non valido o immagine non jpg
* 500, se fallisce la query o il salvataggio dell'immagine


### Endpoint /post

#### GET

Recupera i post creati di un utente oppure i post che compaiono nella bacheca quindi quelli dell'utente e di quelli che segue, ordinati per data di creazione e filtra i post in base ai post moderati (solo i moderatori possono vedere i post moderati).
Inoltre se l'utente è un moderatore recupera i post con i flag ordinati in base al numero di flag. 


Headers:
* bearer (string)

Parameters:
* username (string) - match completo
* view (string) - deve essere uguale a flagged per visualizzare post flaggati 
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT moderatore FROM utente WHERE username=$1`

`SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
JOIN utente u ON u.username = p.username_utente
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE u.username = $1 AND (p.username_moderatore IS NULL AND p.data_moderazione IS NULL)
ORDER BY p.data_creazione DESC, p.id DESC
LIMIT $2 OFFSET $3;`

`SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
JOIN utente u ON u.username = p.username_utente
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE u.username = $1
OR u.username IN (
SELECT s.username_seguito
FROM utente u2
JOIN seguire s ON s.username_seguitore = u2.username
WHERE u2.username = $1)
AND (p.username_moderatore IS NULL AND p.data_moderazione IS NULL)
ORDER BY p.data_creazione DESC, p.id DESC
LIMIT $2 OFFSET $3;`

`SELECT p.username_utente, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COUNT(f.id_post) AS num_flag, 
CASE WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
JOIN post_flag f ON p.id = f.id_post
WHERE data_moderazione IS NULL
GROUP BY p.id, p.username_utente, p.data_creazione, p.tipo_testo, p.contenuto
ORDER BY num_flag DESC, p.data_creazione DESC, p.id DESC
LIMIT $1 OFFSET $2;`

`SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
JOIN utente u ON u.username = p.username_utente
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE u.username = $1
ORDER BY p.data_creazione DESC, p.id DESC
LIMIT $2 OFFSET $3;`

`SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
JOIN utente u ON u.username = p.username_utente
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE u.username = $1
OR u.username IN (
SELECT s.username_seguito
FROM utente u2
JOIN seguire s ON s.username_seguitore = u2.username
WHERE u2.username = $1)
ORDER BY p.data_creazione DESC, p.id DESC
LIMIT $2 OFFSET $3;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 403, utente non può visualizzare post flaggati se non è moderatore
* 500, se fallisce la query

#### POST

Creare un post solo con testo o solo con immagine. Permette di creare un post soltanto se l'utente non ha almeno 3 post moderati negli ultimo 30 giorni.

Headers:
* bearer (string)

Parameters:
* pimage (multipart/form-data, immagine jpg)

Request body:
{
"contenuto": "string",
}

Queries:
`SELECT COUNT (*) as num_post_mod
FROM post
WHERE username_utente=$1 AND (username_moderatore IS NOT NULL AND data_moderazione IS NOT NULL)
AND data_moderazione >= CURRENT_DATE - INTERVAL '30 days';`

`SELECT COUNT (*) as num_post_mod
FROM post
WHERE username_utente=$1 AND (username_moderatore IS NOT NULL AND data_moderazione IS NOT NULL) AND data_moderazione >= CURRENT_DATE - INTERVAL '30 days';`

`INSERT INTO post (username_utente, data_creazione, tipo_testo, url, contenuto) VALUES ($1, CURRENT_DATE, $2, $3, $4);`

Responses:
* 200, post creato
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido o immagine non .jpg
* 403, l'utente non può pubblicare altri post perchè ha almeno 3 post moderati
* 500, se fallisce la query o se fallisce salvataggio immagine


### Endpoint /post/{id}

#### GET

Recupera informazioni post e se l'utente è moderatore anche chi ha moderato il post e la data di moderazione

Headers:
* bearer (string)

Queries:
`SELECT moderatore FROM utente WHERE username=$1`

`SELECT p.id, p.username_utente, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE id=$1 AND p.username_moderatore IS NULL AND p.data_moderazione IS NULL;`

`SELECT p.id, p.username_utente, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
CASE
WHEN p.tipo_testo = true THEN p.contenuto
END AS contenuto
FROM post p
LEFT JOIN (
SELECT id_post, COUNT(*) AS numLike
FROM post_like
GROUP BY id_post) l ON l.id_post = p.id
LEFT JOIN (
SELECT id_post, COUNT(*) AS numFlag
FROM post_flag
GROUP BY id_post) f ON f.id_post = p.id
WHERE id=$1`

Responses:
* 200, restituisce risultato
* 400, token non presente o malformato
* 401, token non valido
* 404, id non esiste
* 500, se fallisce la query

#### PATCH

I moderatori rendono un post moderato 

Headers:
* bearer (string)

Queries:
`SELECT moderatore FROM utente WHERE username=$1`
`UPDATE post SET username_moderatore=$1, data_moderazione = CURRENT_DATE WHERE id = $2;`

Responses:
* 200, post moderato
* 400, token non presente o malformato
* 401, token non valido
* 403, operazione non permessa l'utente non ha i permessi per farla
* 404, id non esiste
* 500, se fallisce la query

#### DELETE

Eliminare post

Headers:
* bearer (string)

Queries:
`SELECT id FROM post WHERE id=$1 AND username_utente=$2`
`DELETE FROM post WHERE id=$1 AND username_utente=$2`

Responses:
* 200, post eliminato
* 400, token non presente o malformato
* 401, token non valido
* 403, operazione non permessa, solo l'utente creatore del post può eliminarlo
* 404, id non esiste
* 500, se fallisce la query


### Endpoint /post/{id}/immagine

#### GET

Recupera immagine del post

Headers:
* bearer (string)

Query: 
`SELECT url FROM post WHERE id = $1;`

Responses:
* 200, restituisce immagine jpeg
* 400, token non presente o malformato, o parametri malformati
* 401, token non valido
* 404, immagine non esiste
* 500, se fallisce la query


### Endpoint /post/{id}/like

#### GET

Recupera utenti che hanno lasciato like al post

Headers:
* bearer (string)

Parametri
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT username_utente FROM post_like WHERE id_post=$1;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query

#### POST

Mettere like a un post

Headers:
* bearer (string)

Queries:
`INSERT INTO post_like (username_utente, id_post) VALUES ($1, $2);`

Responses:
* 200, messo like al post
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query

#### PATCH

Togliere like al post

Headers:
* bearer (string)

Queries:
`SELECT username_utente FROM post_like WHERE id_post=$1 AND username_utente=$2`
`DELETE FROM post_like WHERE id_post=$1 AND username_utente=$2`

Responses:
* 200, rimosso like al post
* 400, token non presente o malformato
* 401, token non valido oppure non è presente like
* 500, se fallisce la query


### Endpoint /post/{id}/flag

#### GET

Recupera utenti che hanno lasciato flag al post

Headers:
* bearer (string)

Parametri
* size (int) - 1-50
* page (int) - 1-n

Queries:
`SELECT username_utente FROM post_flag WHERE id_post=$1;`

Responses:
* 200, restituisce parametri effettivi e risultati
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query

#### POST

Mettere flag a un post

Headers:
* bearer (string)

Queries:
`INSERT INTO post_flag (username_utente, id_post) VALUES ($1, $2);`

Responses:
* 200, messo flag al post
* 400, token non presente o malformato
* 401, token non valido
* 500, se fallisce la query

#### PATCH

Togliere flag al post

Headers:
* bearer (string)

Queries:
`SELECT username_utente FROM post_flag WHERE id_post=$1 AND username_utente=$2`
`DELETE FROM post_flag WHERE id_post=$1 AND username_utente=$2`

Responses:
* 200, rimosso flag al post
* 400, token non presente o malformato
* 401, token non valido oppure il flag non esiste
* 404, id non esiste
* 500, se fallisce la query
