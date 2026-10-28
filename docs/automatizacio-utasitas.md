# Marketing Hub feltöltés – utasítás az automatizációknak

Ezt a részt másold be minden tartalomgeneráló automatizáció promptjának végére. A `<…>` helyeket töltsd ki.

---

**Feltöltés a Marketing Hubba (minden futás végén kötelező).**

Hub címe: `<HUB_URL>` (pl. https://marketing-hub-xxx.vercel.app)
API kulcs: a `MARKETING_HUB_API_KEY` titokból / környezeti változóból. Soha ne írd bele a posztba vagy a válaszba.
Projekt: `<projectId>` (spinvincible | kt | linkedin | kiholma)

1. Minden elkészült képet/videót tölts fel egyenként:
   - `POST <HUB_URL>/api/upload`, fejléc `Authorization: Bearer <kulcs>`, body:
     `{"projectId":"<projectId>","filename":"<fájlnév>","contentType":"image/png","size":<bájt>}`
   - A válasz `url`-jére: `PUT`, fejléc `Content-Type` = ugyanaz, body = a fájl. Jegyezd meg a kapott `key`-t.
2. Utána egyetlen kérésben küldd el a posztokat: `POST <HUB_URL>/api/posts/batch`, ugyanazzal a fejléccel:
   ```json
   {
     "batchId": "<automationId>:<futás dátuma vagy azonosítója>",
     "projectId": "<projectId>",
     "source": { "automationId": "<automationId>", "runId": "<futás azonosítója>", "model": "<modell>" },
     "posts": [{
       "externalId": "<projectId>:<YYYY-MM-DD>:<szekció>:<sorszám>",
       "section": "<szekció>",
       "platforms": ["instagram"],
       "status": "scheduled",
       "scheduledAt": "2026-11-03T18:00:00+01:00",
       "text": { "title": "<cím, Redditnél kötelező>", "caption": "<szöveg>", "hashtags": ["# nélkül"] },
       "media": [{ "key": "<az 1. lépés key-je>", "order": 0, "altText": "<mi látszik>" }],
       "tags": ["sub:r/<subreddit> – csak Redditnél"]
     }]
   }
   ```
3. Szekciók projektenként:
   - spinvincible: `kep`, `video`, `social`
   - kt: `kep`, `video`, `social`, `reddit`
   - linkedin: `linkedin`, `reddit`
   - kiholma: `kep`, `video`, `social`, `terv`
4. Szabályok:
   - Az `externalId` ugyanarra a posztra mindig ugyanaz legyen (projekt + nap + szekció + sorszám), ne véletlen. Így egy újrafuttatás frissít, nem duplikál.
   - Ha a kérés hálózati hiba vagy 5xx miatt elhasal, küldd újra **ugyanazzal** a `batchId`-val és tartalommal.
   - `422` esetén az `issues` mező megmondja a hibás mezőt (pl. `posts[2].media[0].key`): javítsd és küldd újra.
   - Előre gyártott csomag újragenerálásakor add meg: `"replaceRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}`.
   - A futás végén írd ki a válasz `items` listáját (created/updated).
