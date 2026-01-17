const pg = require (`pg`)
const path = require('path')
const fs = require('fs');
const crypto = require('crypto') //modulo interno a node per la crittografia

const jwt = require('jsonwebtoken')
const jwt_secret = "SegretoSegretoso"

const pool = new pg. Pool ({
    user : `postgres`,
    host : `localhost`,
    database : `fotogram`,
    password : `root`,
    port : 5432,
})

module.exports = function ( app ) { 
    app.post(`/register`, register)
    app.post(`/login`, login)
    app.post(`/refresh`,auth, refresh)
    app.post(`/logout`, auth, logout)
    app.get (`/utenti`, auth, getUtenti)
    app.get (`/utenti/:username`, auth, getUtente)
    app.patch (`/utenti/:username`, auth, patchUtente)       //amministratore rende moderatore utente
    app.get(`/utenti/:username/imgProfilo`, auth, getImgProfilo)        //anche l'utente loggato userà questo endpoint per fare la get della sua imgProfilo
    app.get (`/profilo`, auth, getProfilo)             //utente loggato
    app.patch (`/profilo`, auth, patchProfilo)
    app.delete(`/profilo`, auth, deleteProfilo)
    app.post(`/profilo/imgProfilo`, auth, postImgProfilo)       //inserire o modificare foto profilo utente loggato
    app.post(`/post`, auth, postPost)
    app.get(`/post`, auth, getPosts)
    app.get(`/post/:id`, auth, getPost)
    app.get(`/post/:id/immagine`, auth, getPostImmagine)                  
    app.patch(`/post/:id`, auth, patchPost)             //post moderato dai moderatori
    app.delete(`/post/:id`, auth, deletePost)
    app.post(`/post/:id/like`, auth, postLike)          
    app.get(`/post/:id/like`, auth, getLikes)           
    app.patch(`/post/:id/like`, auth, patchLike)        //togliere like a post      
    app.post(`/post/:id/flag`, auth, postFlag)          
    app.get(`/post/:id/flag`, auth, getFlag)           
    app.patch(`/post/:id/flag`, auth, patchFlag)           //togliere flag a post      
    app.post(`/profilo/seguiti`, auth, postSeguito)     
    app.get (`/profilo/seguiti`, auth , getSeguiti)
    app.delete (`/profilo/seguiti/:username`, auth , deleteSeguito)    //toglie utente che si segue
    app.get (`/profilo/follower`, auth , getFollower)
}

const register = (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Registra utente'

    if (
        !req.body || !req.body.username || !req.body.email || !req.body.password_account ||
        typeof req.body.username !== 'string' || req.body.username.trim() === '' || req.body.username.trim().length > 32 ||
        typeof req.body.email !== 'string' || req.body.email.trim() === '' || req.body.email.trim().length > 32 ||
        typeof req.body.password_account !== 'string' || req.body.password_account.trim() === ''
    ){
        return res.status(400).send({message: 'Parametri invalidi o mancanti.' })
    }

    const salt = crypto.randomBytes(16).toString('hex') //salt personale: stessa pass, hash diversi per ogni utente


    crypto.scrypt(req.body.password_account, salt, 64, (err, hash) => { //produce la hash dalla pass e salt
        const query = `
        INSERT INTO utente (username, email, password_account)
        VALUES ($1, $2, $3);`

        const qvals = [req.body.username, req.body.email, hash.toString('hex') + "." + salt]

        pool.query(query, qvals).then((results) => {
            return res.send(results.rows[0])
        }).catch((err) => {
            console.log(err)
            return res.status(500).send({message: 'Query error.'})
        })
    })
}

const login = (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Collega utente'

    if(req.body === undefined || req.body.username === undefined || req.body.password_account === undefined)
        return res.status(400).send({message: 'Parametri invalidi o mancanti.' })

    const query = `SELECT password_account FROM utente WHERE username = $1;` //recupero le credenziali dal DB
    const qvals = [req.body.username]
    
    pool.query(query, qvals).then((results) => {
        if(results.rows.length == 0)
            return res.status(401).send({message: 'Credenziali errate.'})

        const [hpass, salt] = results.rows[0].password_account.split('.') //separo pass hashata e salt

        crypto.scrypt(req.body.password_account, salt, 64, (err, hash) => { //cripto la pass della richiesta con il salt
            if(hash.toString('hex') != hpass) //vedo se combacia con quella nel db
                return res.status(401).send({message: 'Credenziali errate.' })

            const sessid = crypto.randomBytes(16).toString('hex') //genero sessid randomico per il refresh token

            const query = `UPDATE utente SET sessid = $1 WHERE username = $2;` //salvo sessid nel DB
            const qvals = [sessid, req.body.username]

            pool.query(query, qvals).then((results) => {
                const payload = {username: req.body.username} //payload: username, possibile passare dati di stato aggiuntivi
                const token = jwt.sign(payload, jwt_secret, {expiresIn: 5*60}) //durata 5 min, in genere pochi minuti
                const refresh = jwt.sign(payload, sessid) //durata illimitata (si puo' anche limitare a giorni o mesi)
                return res.send({token, refresh}) //restituisco token e refresh
            })
        })
    }).catch((err) => {
        return res.status(500).send({message: 'Query error.' })
    })
}

const refresh = (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Rinfresca il token'

    if(req.body === undefined || req.body.refresh === undefined)
        return res.status(400).send({message: 'Parametri invalidi o mancanti.' })

    const query = `SELECT sessid FROM utente WHERE username = $1;` //trova sessid del refresh token
    const qvals = [req.username] //prevede che il middleware auth funzioni (token ancora valido)

    //possibile anche fare refresh su token scaduto (ricordate, il token e' in chiaro)
    pool.query(query, qvals).then((results) => {
        if(results.rows.length == 0)
            return res.status(401).send({message: 'Credenziali errate.'})

        jwt.verify(req.body.refresh, results.rows[0].sessid, (err, pay) => { //valida il refresh token
            if(err)
                return res.status(401).send({message: 'Refresh non valido.' })

            const sessid = crypto.randomBytes(16).toString('hex') //genero sessid randomico per il refresh token

            const query = `UPDATE utente SET sessid = $1 WHERE username = $2;` //salvo sessid nel DB
            const qvals = [sessid, req.username]

            pool.query(query, qvals).then((results) => {
                const payload = {username: req.username} //payload: username, possibile passare dati di stato aggiuntivi
                const token = jwt.sign(payload, jwt_secret, {expiresIn: 5*60}) //durata 5 min, in genere pochi minuti
                const refresh = jwt.sign(payload, sessid) //durata illimitata (si puo' anche limitare a giorni o mesi)
                return res.send({token, refresh}) //restituisco token e refresh
            })
        })
    }).catch((err) => {
        return res.status(500).send({message: 'Query error.' })
    })
}

const logout = (req, res) => { 
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Scollega utente'

    const query = `UPDATE utente SET sessid = NULL WHERE username = $1;`
    const qvals = [req.username]

    pool.query(query, qvals).then((results) => {
        return res.send({message: 'Logged out.' })
    }).catch((err) => {
        return res.status(500).send({message: 'Query error.' })
    })
}

const auth = (req , res , next ) => {
    if(req.headers["bearer"]===undefined)
        return res.status(401).send({message: 'Token non fornito.' })
    
    const token = req.headers["bearer"]

    jwt.verify(token, jwt_secret, (err, pay) => {
        if(err)
            return res.status(401).send({message: 'Token non valido.' })
    
        req.username = pay.username //se il token verifica, il payload e' valido
        next()
    })
}

//mostra informaizoni degli utente filtrati in base a un username inserito dall'utente loggato
const getUtenti = (req , res) => {                  
    // #swagger.tags = ['Utente']
    // #swagger.summary = 'Visualizzare utenti filtrati per username'

    const params = {}
    params.search = ( req.query.q === undefined ) ? "" : req.query.q
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    const query = `
    SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
    FROM utente u
    LEFT JOIN (
        SELECT username_seguitore, COUNT(*) AS seguiti
        FROM seguire
        GROUP BY username_seguitore
    ) s ON s.username_seguitore = u.username
    LEFT JOIN (
        SELECT username_seguito, COUNT(*) AS follower
        FROM seguire
        GROUP BY username_seguito
    ) f ON f.username_seguito = u.username
    WHERE u.username LIKE $1
    LIMIT $2 OFFSET $3;`

    const qvals = [`%${params.search}%`, params.size +1, params.page * params.size]

    pool.query(query, qvals).then((results) => {
        if(results.rows.length > params.size ) {
            params.result = results.rows.slice (0 , -1)
            params.next = params.page +1
        }
        params.result = results.rows.map(user => ({
            ...user,
            postLINK: `/utenti/${user.username}/imgProfilo`
        }));

        return res.send(params);
    }).catch ((err) => {
        console.log(err)
        return res.status (500).send ({ message : `Query error.`}) ;
    })
}

const getUtente = (req , res) => {                      //mostra informaizoni profilo dell'utente
    // #swagger.tags = ['Utente']
    // #swagger.summary = 'Visualizzare info utente'

    //coalesce è come count ma in caso sia null il valore mette 0

    const query = `
    SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
    FROM utente u
    LEFT JOIN (
        SELECT username_seguitore, COUNT(*) AS seguiti
        FROM seguire
        GROUP BY username_seguitore
    ) s ON s.username_seguitore = u.username
    LEFT JOIN (
        SELECT username_seguito, COUNT(*) AS follower
        FROM seguire
        GROUP BY username_seguito
    ) f ON f.username_seguito = u.username
    WHERE u.username = $1;`

    const qvals = [req.params.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length == 1){
           results.rows[0].links = {
                post: "/post?username=" + results.rows[0].username + "&size=20&page=0",
                imgProfilo: "/utenti/" + results.rows[0].username + "/imgProfilo"
            }
            return res.send(results.rows[0])
        }
        else
            return res.status(404).send({message: 'Not found.' })
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const patchUtente = (req, res) => {                    //rende un utente un moderatore soltanto se l'utente loggato è un amministratore
    // #swagger.tags = ['Utente']
    // #swagger.summary = 'Modifica utente rendendolo moderatore'

    const params={}
    params.search = req.params.username

    const query=`
    SELECT amministratore FROM utente WHERE username=$1`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows[0].amministratore==false){
            return res.status(403).send({ message: 'Permesso negato.'});
        }else{
            const query2 = `UPDATE utente SET moderatore = true, data_inizio_mod = CURRENT_DATE WHERE username = $1;`

            const qvals2 = [params.search]

            pool.query(query2,qvals2).then((results) => {
                return res.send({message: 'Utente è diventato moderatore' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.'})
    })
}

const getProfilo = (req, res) => {
    // #swagger.tags = ['Profilo']
    // #swagger.summary = 'Visualizzare il profilo del utente autenticato'

    const query = `
    SELECT u.username, u.email, COUNT (DISTINCT s.username_seguito) as seguiti, COUNT (DISTINCT s2.username_seguitore) as follower
    FROM utente u LEFT JOIN seguire s ON s.username_seguitore=u.username
    LEFT JOIN seguire s2 ON s2.username_seguito=u.username
    WHERE u.username=$1
    GROUP BY u.username, u.email;`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length == 1){
            results.rows[0].links = {
                post: "/post?username=" + results.rows[0].username + "&size=20&page=0",
                imgProfilo: "/utenti/" + results.rows[0].username + "/imgProfilo"
            }
            return res.send(results.rows[0])
        }
        else
            return res.status(404).send({message: 'Not found.'})
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.'})
    })
}

const patchProfilo = (req, res) => {
    // #swagger.tags = ['Profilo']
    // #swagger.summary = 'Modifica il profilo del utente autenticato'

    const updates = []
    const values = []
    let index = 1

    //email
    if (typeof req.body.email === 'string' && req.body.email.trim() !== '') {
        updates.push(`email = $${index++}`)
        values.push(req.body.email.trim())
    }

    // password (da hashare con salt)
    if (typeof req.body.password_account === 'string' && req.body.password_account.trim() !== '') {
        const salt = crypto.randomBytes(16).toString('hex')
        crypto.scrypt(req.body.password_account, salt, 64, (err, derivedKey) => {
            if (err) return res.status(500).send({ message: 'Hash error.' })

            const hashedPassword = derivedKey.toString('hex') + '.' + salt
            updates.push(`password_account = $${index++}`)
            values.push(hashedPassword)

            // Dopo che abbiamo tutto, esegui l'UPDATE
            executeUpdate()
        })
    } else {
        // Nessuna password da aggiornare
        executeUpdate()
    }

    function executeUpdate() {
        if (updates.length === 0) {
            return res.status(400).send({ message: 'Nessun campo valido da aggiornare.' })
        }

        const query = `
            UPDATE utente
            SET ${updates.join(', ')}
            WHERE username = $${index} `
        
        values.push(req.username) // valore $index → WHERE username = ...

        pool.query(query, values).then((result) => {
                res.send({ message: 'Profilo aggiornato con successo.', utente: result.rows[0] })
            })
            .catch((err) => {
                console.error(err)
                res.status(500).send({ message: 'Errore nella query.' })
            })
    }
}

const deleteProfilo = (req, res) => {
    // #swagger.tags = ['Profilo']
    // #swagger.summary = 'Elimina il profilo del utente autenticato'

    const query = `DELETE FROM utente WHERE username=$1`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        return res.send({message: 'Profilo eliminato.' })
    }).catch((err) => {
        return res.status(500).send({message: 'Query error.' })
    })
}

const postImgProfilo = (req, res) => {
    // #swagger.tags = ['Profilo']
    // #swagger.summary = 'Carica foto profilo'
    /* #swagger.requestBody = {
        required: true,
        content: {
            "multipart/form-data": {
                schema: {
                    type: "object",
                    properties: {
                        pimage: {
                            type: "string",
                            format: "binary"
                        }
                    }
                }
            }
        }
    }
    */
    
    if (!req.files || !req.files.pimage) {
        return res.status(400).send({ message: 'No image received.' })
    }

    if (req.files.pimage.mimetype !== "image/jpeg")
        return res.status(401).send({message: 'Only .jpg allowed.' })

    const savePath = path.join(__dirname, 'resources', `${req.username}.jpg`);
        
    req.files.pimage.mv(savePath, async (err) => {
        if (err) {
            return res.status(500).send({ message: 'Failed to save image.' })
        }
        // Salva il percorso nel database
        const query=`UPDATE utente SET img_profilo = $1 WHERE username = $2;`
        const qvals = [savePath, req.username]

        await pool.query(query,qvals).then((results) => {
            return res.send({ message: 'Profile image uploaded.' })
        }).catch((err) => {
            console.log(err)
            return res.status(500).send({message: 'Query error.' })
        })
    })
}

const getImgProfilo = (req, res) => {
    // #swagger.tags = ['Utente']
    // #swagger.summary = 'Recupera immagini'
    // #swagger.produces = ['image/jpeg']

    const query = `SELECT img_profilo FROM utente WHERE username = $1;`

    const qvals = [req.params.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length == 1){
            const filePath = results.rows[0].img_profilo

            if (!fs.existsSync(filePath)) {
                return res.status(404).send({ message: 'Image file not found.' })
            }
            res.sendFile(filePath)
        }
        else
            return res.status(404).send({message: 'Not found.'})
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const postPost = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Creare un nuovo post'
    /* #swagger.requestBody = {
        required: true,
        content: {
            "multipart/form-data": {
                schema: {
                    type: "object",
                    properties: {
                        contenuto: {
                            type: "string"
                        },
                        pimage: {
                            type: "string",
                            format: "binary"
                        }
                    }
                }
            }
        }
    } */

    let tipo_testo, url, contenuto;

    const haContenuto = req.body.contenuto != null && req.body.contenuto !== '';
    const haImmagine = req.files && req.files.pimage != null;

    // Devono essere O uno o l'altro, non entrambi o nessuno
    if ((haContenuto && haImmagine) || (!haContenuto && !haImmagine)) {
        return res.status(400).send({ message: 'Parametri invalidi o mancanti.' });
    }

    const query2 = `
    SELECT COUNT (*) as num_post_mod
    FROM post
    WHERE username_utente=$1 AND (username_moderatore IS NOT NULL AND data_moderazione IS NOT NULL)
    AND data_moderazione >= CURRENT_DATE - INTERVAL '30 days';`

    const qvals2 = [req.username]

    pool.query(query2,qvals2).then((results) => {
        if(results.rows[0].num_post_mod >= 3){
            return res.status(403).send({message: 'Non ti è consentito pubblicare nuovi post perché almeno 3 dei tuoi post precedenti sono stati moderati.'})
        }else{
            if (haContenuto && !haImmagine) {
                tipo_testo = true;
                contenuto = req.body.contenuto;
                url = null;
                
                const query = `INSERT INTO post (username_utente, data_creazione, tipo_testo, url, contenuto) 
                VALUES ($1, CURRENT_DATE, $2, $3, $4);`

                const qvals = [req.username, tipo_testo, url, contenuto]

                pool.query(query,qvals).then((results) => {
                    return res.send({message: 'Post creato' })
                }).catch((err) => {
                    console.log(err)
                    return res.status(500).send({message: 'Query error.' })
                })

            } else {
                tipo_testo = false;
                contenuto = null;

                if (req.files.pimage.mimetype !== "image/jpeg")
                    return res.status(401).send({message: 'Only .jpg allowed.' })

                const savePath = path.join(__dirname, 'resources', `${Date.now()}_${req.username}.jpg`);
                    
                req.files.pimage.mv(savePath, async (err) => {
                    if (err) {
                        return res.status(500).send({ message: 'Failed to save image.' })
                    }

                    const query = `INSERT INTO post (username_utente, data_creazione, tipo_testo, url, contenuto) 
                    VALUES ($1, CURRENT_DATE, $2, $3, $4);`

                    const qvals = [req.username, tipo_testo, savePath, contenuto]

                    pool.query(query,qvals).then((results) => {
                        return res.send({message: 'Post creato' })
                    }).catch((err) => {
                        console.log(err)
                        return res.status(500).send({message: 'Query error.' })
                    })
                    })
            }
        }
    }).catch((err) => {
            console.log(err)
            return res.status(500).send({message: 'Query error.' })
    })
}

/*Visualizza post di un utente oppure i post che compaiono all'utente nella bacheca quindi i post pubblicati dall'utente stesso e da tutti gli utenti che l'utente segue, ordinati per momento di creazione.
Oppure se l'utente è un moderatore visualizza post flaggati, ordinati in basi al numero di flag*/
const getPosts = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Visualizza i post dello utente oppure la bacheca oppure i posti flaggati'
    
    const params = {} // inizializza parametri di chiamata
    params.searchUsername = ( req.query.username === undefined ) ? "" : req.query.username
    params.flagged = ( req.query.view === undefined ) ? "" : req.query.view                     //parametro per visualizzare solo post flaggati, deve essere uguale a flagged e params.searchUsername===undefined
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    if (
        (params.flagged && params.flagged !== "flagged") ||  // se flagged ha un valore diverso da "flagged"
        (params.flagged !== "" && params.searchUsername !== "") // se entrambi sono valorizzati
    ) {
        return res.status(400).send({ message: 'Parametri invalidi o mancanti.' });
    }

    const query=`SELECT moderatore FROM utente WHERE username=$1`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        //gli utenti non moderatori non possono visualizzare i post moderati
        if(results.rows[0].moderatore===false){
            //utente non moderatore non può visualizzare post flaggati
            if (params.flagged=="flagged"){
                return res.status(403).send({message: 'Permesso negato'})
            }
            //mostrare post creati da un utente presenti nel suo profilo
            if (params.searchUsername!=""){
                const query2 = `
                SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
                CASE 
                WHEN p.tipo_testo = true THEN p.contenuto
                END AS contenuto
                FROM post p
                JOIN utente u ON u.username = p.username_utente
                LEFT JOIN (
                SELECT id_post, COUNT(*) AS numLike
                FROM post_like
                GROUP BY id_post
                ) l ON l.id_post = p.id
                LEFT JOIN (
                SELECT id_post, COUNT(*) AS numFlag
                FROM post_flag
                GROUP BY id_post
                ) f ON f.id_post = p.id
                WHERE u.username = $1 AND (p.username_moderatore IS NULL AND p.data_moderazione IS NULL)
                ORDER BY p.data_creazione DESC, p.id DESC
                LIMIT $2 OFFSET $3;`

                const qvals2 = [req.query.username, params.size +1, params.page * params.size]

                pool.query(query2, qvals2).then((results) => {
                    if(results.rows.length > params.size ) {
                        params.result = results.rows.slice (0 , -1)
                        params.next = params.page +1
                    }
                    params.result = results.rows.map(post => {
                        const basePost = {
                            ...post,
                            imgProfilo: `/utenti/${post.username}/imgProfilo`
                        };

                        if (post.contenuto === null) {
                            return {
                                ...basePost,
                                postLINK: `/post/${post.id}/immagine`
                            };
                        }
                        return basePost; // lasciamo l'oggetto invariato se contenuto è null
                    });

                    return res.send(params);
                }).catch ((err) => {
                    console.log(err)
                    return res.status (500).send ({ message : `Query error.` }) ;
                })
            }else{
                //mostrare bacheca utente loggato
                const query2 = `
                    SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
                    CASE 
                        WHEN p.tipo_testo = true THEN p.contenuto
                    END AS contenuto
                    FROM post p
                    JOIN utente u ON u.username = p.username_utente
                    LEFT JOIN (
                        SELECT id_post, COUNT(*) AS numLike
                        FROM post_like
                        GROUP BY id_post
                    ) l ON l.id_post = p.id
                    LEFT JOIN (
                        SELECT id_post, COUNT(*) AS numFlag
                        FROM post_flag
                        GROUP BY id_post
                    ) f ON f.id_post = p.id
                    WHERE u.username = $1
                    OR u.username IN (
                        SELECT s.username_seguito
                        FROM utente u2
                        JOIN seguire s ON s.username_seguitore = u2.username
                        WHERE u2.username = $1
                    )
                    AND (p.username_moderatore IS NULL AND p.data_moderazione IS NULL)
                    ORDER BY p.data_creazione DESC, p.id DESC
                    LIMIT $2 OFFSET $3;`

                const qvals2 = [req.username, params.size +1, params.page * params.size]

                pool.query(query2, qvals2).then((results) => {
                    if(results.rows.length > params.size ) {
                        params.result = results.rows.slice (0 , -1)
                        params.next = params.page +1
                    }
                    params.result = results.rows.map(post => {
                        const basePost = {
                            ...post,
                            imgProfilo: `/utenti/${post.username}/imgProfilo`
                        };

                        if (post.contenuto === null) {
                            return {
                                ...basePost,
                                postLINK: `/post/${post.id}/immagine`
                            };
                        }
                        return basePost; // lasciamo l'oggetto invariato se contenuto è null
                    });
                    return res.send(params);
                }).catch ((err) => {
                    console.log(err)
                    return res.status (500).send ({ message : `Query error.` }) ;
                })
            }
        }else{
            //visualizzare post flaggati
            if (params.flagged=="flagged"){
                const query2 = `
                SELECT p.username_utente, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COUNT(f.id_post) AS num_flag, 
                CASE WHEN p.tipo_testo = true THEN p.contenuto
                END AS contenuto
                FROM post p
                JOIN post_flag f ON p.id = f.id_post
                WHERE data_moderazione IS NULL
                GROUP BY p.id, p.username_utente, p.data_creazione, p.tipo_testo, p.contenuto
                ORDER BY num_flag DESC, p.data_creazione DESC, p.id DESC
                LIMIT $1 OFFSET $2;`

                const qvals2 = [params.size +1, params.page * params.size]

                pool.query(query2, qvals2).then((results) => {
                    if(results.rows.length > params.size ) {
                        params.result = results.rows.slice (0 , -1)
                        params.next = params.page +1
                    }
                    params.result = results.rows.map(post => {
                        const basePost = {
                            ...post,
                            imgProfilo: `/utenti/${post.username_utente}/imgProfilo`
                        };

                        if (post.contenuto === null) {
                            return {
                                ...basePost,
                                postLINK: `/post/${post.id}/immagine`
                            };
                        }
                        return basePost; // lasciamo l'oggetto invariato se contenuto è null
                    });

                    return res.send(params);
                }).catch ((err) => {
                    console.log(err)
                    return res.status(500).send ({ message : `Query error.` }) ;
                })
            }

            //mostrare post creati da un utente presenti nel suo profilo
            if (params.searchUsername!=""){
                const query2 = `
                SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
                CASE 
                WHEN p.tipo_testo = true THEN p.contenuto
                END AS contenuto
                FROM post p
                JOIN utente u ON u.username = p.username_utente
                LEFT JOIN (
                SELECT id_post, COUNT(*) AS numLike
                FROM post_like
                GROUP BY id_post
                ) l ON l.id_post = p.id
                LEFT JOIN (
                SELECT id_post, COUNT(*) AS numFlag
                FROM post_flag
                GROUP BY id_post
                ) f ON f.id_post = p.id
                WHERE u.username = $1
                ORDER BY p.data_creazione DESC, p.id DESC
                LIMIT $2 OFFSET $3;`

                const qvals2 = [req.query.username, params.size +1, params.page * params.size]

                pool.query(query2, qvals2).then((results) => {
                    if(results.rows.length > params.size ) {
                        params.result = results.rows.slice (0 , -1)
                        params.next = params.page +1
                    }
                    params.result = results.rows.map(post => {
                        const basePost = {
                            ...post,
                            imgProfilo: `/utenti/${post.username}/imgProfilo`
                        };

                        if (post.contenuto === null) {
                            return {
                                ...basePost,
                                postLINK: `/post/${post.id}/immagine`
                            };
                        }
                        return basePost; // lasciamo l'oggetto invariato se contenuto è null
                    });

                    return res.send(params);
                }).catch ((err) => {
                    console.log(err)
                    return res.status (500).send ({ message : `Query error.` }) ;
                })
            }
            if (params.searchUsername=="" && params.flagged==""){
                //mostrare bacheca utente loggato
                const query2 = `
                    SELECT u.username, p.id, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
                    CASE 
                        WHEN p.tipo_testo = true THEN p.contenuto
                    END AS contenuto
                    FROM post p
                    JOIN utente u ON u.username = p.username_utente
                    LEFT JOIN (
                        SELECT id_post, COUNT(*) AS numLike
                        FROM post_like
                        GROUP BY id_post
                    ) l ON l.id_post = p.id
                    LEFT JOIN (
                        SELECT id_post, COUNT(*) AS numFlag
                        FROM post_flag
                        GROUP BY id_post
                    ) f ON f.id_post = p.id
                    WHERE u.username = $1
                    OR u.username IN (
                        SELECT s.username_seguito
                        FROM utente u2
                        JOIN seguire s ON s.username_seguitore = u2.username
                        WHERE u2.username = $1
                    )
                    ORDER BY p.data_creazione DESC, p.id DESC 
                    LIMIT $2 OFFSET $3;`

                const qvals2 = [req.username, params.size +1, params.page * params.size]

                pool.query(query2, qvals2).then((results) => {
                    if(results.rows.length > params.size ) {
                        params.result = results.rows.slice (0 , -1)
                        params.next = params.page +1
                    }
                    params.result = results.rows.map(post => {
                        const basePost = {
                            ...post,
                            imgProfilo: `/utenti/${post.username}/imgProfilo`
                        };

                        if (post.contenuto === null) {
                            return {
                                ...basePost,
                                postLINK: `/post/${post.id}/immagine`
                            };
                        }
                        return basePost; // lasciamo l'oggetto invariato se contenuto è null
                    });

                    return res.send(params);
                }).catch ((err) => {
                    console.log(err)
                    return res.status (500).send ({ message : `Query error.` }) ;
                })
            }
        }
    })
}

const getPost = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Visualizzare info post'

    const query=`SELECT moderatore FROM utente WHERE username=$1`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        //gli utenti non moderatori non possono visualizzare i post moderati
        if(results.rows[0].moderatore==false){
            const query2 = `
            SELECT p.id, p.username_utente, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
            CASE 
            WHEN p.tipo_testo = true THEN p.contenuto
            END AS contenuto
            FROM post p
            LEFT JOIN (
            SELECT id_post, COUNT(*) AS numLike
            FROM post_like
            GROUP BY id_post
            ) l ON l.id_post = p.id
            LEFT JOIN (
            SELECT id_post, COUNT(*) AS numFlag
            FROM post_flag
            GROUP BY id_post
            ) f ON f.id_post = p.id
            WHERE id=$1 AND p.username_moderatore IS NULL AND p.data_moderazione IS NULL;`

            const qvals2 = [req.params.id]

            pool.query(query2,qvals2).then((results) => {
                if(results.rows.length == 1){
                    results.rows[0].postLINK= `/utenti/${results.rows[0].username_utente}/imgProfilo`
                    if (results.rows[0].contenuto === null) {
                        results.rows[0].postLINK= `/post/${req.params.id}/immagine`
                    }
                    return res.send(results.rows[0])
                }else
                    return res.status(404).send({message: 'Not found.'})
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.'})
            })
        }else{
            const query2 = `
            SELECT p.id, p.username_utente, TO_CHAR(p.data_creazione, 'YYYY-MM-DD') AS data_creazione, p.username_moderatore, TO_CHAR(p.data_moderazione, 'YYYY-MM-DD') AS data_moderazione, COALESCE(l.numLike, 0) AS numLike, COALESCE(f.numFlag, 0) AS numFlag,
            CASE 
            WHEN p.tipo_testo = true THEN p.contenuto
            END AS contenuto
            FROM post p
            LEFT JOIN (
            SELECT id_post, COUNT(*) AS numLike
            FROM post_like
            GROUP BY id_post
            ) l ON l.id_post = p.id
            LEFT JOIN (
            SELECT id_post, COUNT(*) AS numFlag
            FROM post_flag
            GROUP BY id_post
            ) f ON f.id_post = p.id
            WHERE id=$1`

            const qvals2 = [req.params.id]

            pool.query(query2,qvals2).then((results) => {
                if(results.rows.length == 1){
                    results.rows[0].postLINK= `/utenti/${results.rows[0].username_utente}/imgProfilo`
                    if(results.rows[0].contenuto===null){
                        results.rows[0].postLINK= `/post/${req.params.id}/immagine`
                    }
                    return res.send(results.rows[0])
                }
                else
                    return res.status(404).send({message: 'Not found.'})
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.'})
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.'})
    })
}

const getPostImmagine = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Recupera immagini'
    // #swagger.produces = ['image/jpeg']

    const query = `SELECT url FROM post WHERE id = $1;`

    const qvals = [req.params.id]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length == 1){
            const filePath = results.rows[0].url

            if (!fs.existsSync(filePath)) {
                return res.status(404).send({ message: 'Image file not found on disk.' })
            }
            res.sendFile(filePath)
        }
        else
            return res.status(404).send({message: 'Not found.'})
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const patchPost = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Rendere un post moderato'

    const query=`SELECT moderatore FROM utente WHERE username=$1`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows[0].moderatore==true){
            const query2 = `UPDATE post SET username_moderatore=$1, data_moderazione = CURRENT_DATE WHERE id = $2;`

            const qvals2 = [req.username, req.params.id]

            pool.query(query2,qvals2).then((results) => {
                return res.send({message: 'Post moderato.' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }else{
            return res.status(403).send({ message: 'Operazione non permessa.'});
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.'})
    })
}

const deletePost = (req, res) => {
    // #swagger.tags = ['Post']
    // #swagger.summary = 'Eliminare un post'

    //capire se il post è creato dall'utente loggato
    const query = `SELECT id FROM post WHERE id=$1 AND username_utente=$2`

    const qvals = [req.params.id, req.username]

    pool.query(query,qvals).then((results) => {
        if (results.rows.length==0)
            return res.status(403).send({message: 'Permesso negato'})
        else{
            const query2 = `DELETE FROM post WHERE id=$1 AND username_utente=$2`
            
            pool.query(query2,qvals).then((results) => {
                return res.send({message: 'Post eliminato.' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const postLike = (req, res) => {
    // #swagger.tags = ['Like']
    // #swagger.summary = 'Mettere like a un post'

    const query = `INSERT INTO post_like (username_utente, id_post) VALUES ($1, $2);`

    const qvals = [req.username, req.params.id]

    pool.query(query,qvals).then((results) => {
        return res.send({message: 'Messo like al post.' })
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const getLikes = (req, res) => {
    // #swagger.tags = ['Like']
    // #swagger.summary = 'Visualizzare utenti che hanno messo un like a un post'

    const params = {} // inizializza parametri di chiamata
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    const query = `SELECT username_utente FROM post_like WHERE id_post=$1;`

    const qvals = [req.params.id]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length > params.size ) {
            params.result = results.rows.slice (0 , -1)
            params.next = params.page +1
        } else {
            params.result = results.rows.map(user => ({
                ...user,
                postLINK: `/utenti/${user.username_utente}/imgProfilo`
            }));
        }
        return res.send(params);
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}
   
const patchLike = (req, res) => {
    // #swagger.tags = ['Like']
    // #swagger.summary = 'Togliere like a un post'

    //capire se l'utente ha messo un like a questo post
    const query = `SELECT username_utente FROM post_like WHERE id_post=$1 AND username_utente=$2`

    const qvals = [req.params.id, req.username]

    pool.query(query,qvals).then((results) => {
        if (results.rows.length==0)
            return resstatus(404).send({message: 'Non trovato.'})
        else{
            const query2 = `DELETE FROM post_like WHERE id_post=$1 AND username_utente=$2`
            
            pool.query(query2,qvals).then((results) => {
                return res.send({message: 'Tolto like.' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const postFlag = (req, res) => {
    // #swagger.tags = ['Flag']
    // #swagger.summary = 'Mettere flag a un post'

    const query = `INSERT INTO post_flag (username_utente, id_post) VALUES ($1, $2);`

    const qvals = [req.username, req.params.id]

    pool.query(query,qvals).then((results) => {
        return res.send({message: 'Messo flag al post.' })
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const getFlag = (req, res) => {
    // #swagger.tags = ['Flag']
    // #swagger.summary = 'Visualizzare utenti che hanno messo un flag a un post'

    const params = {} // inizializza parametri di chiamata
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    const query = `SELECT username_utente FROM post_flag WHERE id_post=$1;`

    const qvals = [req.params.id]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length > params.size ) {
            params.result = results.rows.slice (0 , -1)
            params.next = params.page +1
        } else {
            params.result = results.rows.map(user => ({
                ...user,
                postLINK: `/utenti/${user.username_utente}/imgProfilo`
            }));
        }
        return res.send (params)
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const patchFlag = (req, res) => {
    // #swagger.tags = ['Flag']
    // #swagger.summary = 'Togliere flag a un post'

    //capire se l'utente ha messo flag a questo post
    const query = `SELECT username_utente FROM post_flag WHERE id_post=$1 AND username_utente=$2`

    const qvals = [req.params.id, req.username]

    pool.query(query,qvals).then((results) => {
        if (results.rows.length==0)
            return res.send({message: 'Non trovato.'})
        else{
            const query2 = `DELETE FROM post_flag WHERE id_post=$1 AND username_utente=$2`
            
            pool.query(query2,qvals).then((results) => {
                return res.send({message: 'Tolto flag.' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const postSeguito = (req, res) => {
    // #swagger.tags = ['Seguiti']
    // #swagger.summary = 'Seguire un altro utente'

    if (req.query.username===undefined)
        return res.status(400).send({message: 'Parametro invalido o mancante.' })
    
    const query = `INSERT INTO seguire (username_seguito, username_seguitore) VALUES ($1, $2);`

    const qvals = [req.query.username, req.username]

    pool.query(query,qvals).then((results) => {
        return res.status(200).send({message: 'Hai iniziato a seguire un utente.' })
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const getSeguiti = (req, res) => {
    // #swagger.tags = ['Seguiti']
    // #swagger.summary = 'Visualizzare utenti che segui'

    const params = {} // inizializza parametri di chiamata
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    const query = `
    SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
    FROM utente u
    LEFT JOIN (
        SELECT username_seguitore, COUNT(*) AS seguiti
        FROM seguire
        GROUP BY username_seguitore
    ) s ON s.username_seguitore = u.username
    LEFT JOIN (
        SELECT username_seguito, COUNT(*) AS follower
        FROM seguire
        GROUP BY username_seguito
    ) f ON f.username_seguito = u.username
	WHERE u.username IN (SELECT username_seguito FROM seguire WHERE username_seguitore=$1)
    ORDER BY u.username ASC;`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length > params.size ) {
            params.result = results.rows.slice (0 , -1)
            params.next = params.page +1
        } else {
            params.result = results.rows.map(user => ({
                ...user,
                postLINK: `/utenti/${user.username}/imgProfilo`
            }));
        }
        return res.send (params)
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const deleteSeguito = (req, res) => {
    // #swagger.tags = ['Seguiti']
    // #swagger.summary = 'Rimuovere un seguito'

    //capire se l'utente segue l'utente
    const query = `SELECT username_seguito FROM seguire WHERE username_seguitore=$1 AND username_seguito=$2`

    const qvals = [req.username, req.params.username]

    pool.query(query,qvals).then((results) => {
        if (results.rows.length==0)
            return res.status(404).send({message: 'Non trovato.'})
        else{
            const query2 = `DELETE FROM seguire WHERE username_seguitore=$1 AND username_seguito=$2`
            
            pool.query(query2,qvals).then((results) => {
                return res.status(200).send({message: 'Rimosso utente dai seguiti' })
            }).catch((err) => {
                console.log(err)
                return res.status(500).send({message: 'Query error.' })
            })
        }
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}

const getFollower = (req, res) => {
    // #swagger.tags = ['Follower']
    // #swagger.summary = 'Visualizzare utenti che ti seguono'

    const params = {} // inizializza parametri di chiamata
    params.size = ( isNaN ( req.query.size ) || req.query.size < 1 || req.query.size > 50) ? 20 : parseInt ( req.query.size )
    params.page = ( isNaN ( req.query.page ) || req.query.page < 1) ? 0 : parseInt (req.query.page )
    params.next = null
    params.previous = params.page > 0 ? params .page -1 : null

    const query = `
    SELECT u.username, u.email, COALESCE(s.seguiti, 0) AS seguiti, COALESCE(f.follower, 0) AS follower
    FROM utente u
    LEFT JOIN (
        SELECT username_seguitore, COUNT(*) AS seguiti
        FROM seguire
        GROUP BY username_seguitore
    ) s ON s.username_seguitore = u.username
    LEFT JOIN (
        SELECT username_seguito, COUNT(*) AS follower
        FROM seguire
        GROUP BY username_seguito
    ) f ON f.username_seguito = u.username
	WHERE u.username IN (SELECT username_seguitore FROM seguire WHERE username_seguito=$1)
    ORDER BY u.username ASC;`

    const qvals = [req.username]

    pool.query(query,qvals).then((results) => {
        if(results.rows.length > params.size ) {
            params.result = results.rows.slice (0 , -1)
            params.next = params.page +1
        } else {
            params.result = results.rows.map(user => ({
                ...user,
                postLINK: `/utenti/${user.username}/imgProfilo`
            }));
        }
        return res.send (params)
    }).catch((err) => {
        console.log(err)
        return res.status(500).send({message: 'Query error.' })
    })
}