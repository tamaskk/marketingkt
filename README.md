# Marketing Hub

Személyes, mobilapp-szerű felület a projektjeim marketingjéhez. Next.js (App Router), TypeScript, Tailwind CSS, fájltárolás Cloudflare R2-ben.

> A felület jelszóval védett (`HUB_PASSWORD`). Az automatizációk a két írási végpontot (`/api/upload`, `/api/posts/batch`) az `UPLOAD_API_KEY`-jel érik el, belépés nélkül.

## Indítás

```bash
npm install
cp .env.example .env.local   # majd töltsd ki, lásd lent
npm run dev
```

Nyisd meg: http://localhost:3000 — a `/` az utoljára megnyitott projektre visz.

## Környezeti változók (`.env.local`)

| Változó | Honnan |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → jobb oldalt „Account ID” |
| `R2_ACCESS_KEY_ID` | R2 → Manage R2 API Tokens → Create API token (Object Read & Write, csak erre a bucketre) |
| `R2_SECRET_ACCESS_KEY` | ugyanott, a token létrehozásakor (csak egyszer látszik) |
| `R2_BUCKET` | a bucket neve |
| `UPLOAD_API_KEY` | saját generált kulcs: `openssl rand -hex 32` — ezzel töltenek fel az automatizációk |
| `HUB_PASSWORD` | a felület belépési jelszava (saját, erős jelszó) |
| `MONGODB_URI` | MongoDB Atlas connection string (a posztok szövegei, `marketing-hub` adatbázis) |

A kulcsokat csak a szerver (route handlerek, `lib/r2.ts`) olvassa. Ne adj nekik `NEXT_PUBLIC_` előtagot.

## Poszt API (automatizációk)

Az appban nincs feltöltés: a posztokat (kép/videó + szöveg) a Claude automatizációk küldik.
Ugyanaz a végpont szolgál mindkét módra: a **napi** futás 1 posztot küld, az **előre generált** csomag sokat (max. 200).
Minden írás `Authorization: Bearer $UPLOAD_API_KEY` fejlécet kér.

**1. Előbb a fájlok** (posztonként, médiánként):

```bash
curl -s -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer $UPLOAD_API_KEY" -H "Content-Type: application/json" \
  -d '{"projectId":"spinvincible","filename":"poszt.png","contentType":"image/png","size":123456}'
# → {"url":"https://...","key":"spinvincible/1730...-poszt.png"}
curl -X PUT "<url>" -H "Content-Type: image/png" --data-binary @poszt.png
```

**2. Utána a posztok**, a kapott `key`-ekkel:

```bash
curl -s -X POST http://localhost:3000/api/posts/batch \
  -H "Authorization: Bearer $UPLOAD_API_KEY" -H "Content-Type: application/json" -d @batch.json
```

```json
{
  "batchId": "spinvincible-daily:2026-11-03",
  "projectId": "spinvincible",
  "source": { "automationId": "spinvincible-daily", "runId": "2026-11-03", "model": "claude-sonnet-5-5", "promptVersion": "v1" },
  "posts": [
    {
      "externalId": "spinvincible:2026-11-03:kep:1",
      "section": "kep",
      "platforms": ["instagram", "facebook"],
      "status": "scheduled",
      "scheduledAt": "2026-11-03T18:00:00+01:00",
      "text": {
        "caption": "A poszt szövege",
        "hashtags": ["football", "arsenal"],
        "cta": "Link a bióban",
        "firstComment": "opcionális",
        "title": "opcionális, főleg a Terv szekcióhoz"
      },
      "media": [{ "key": "spinvincible/1730...-poszt.png", "order": 0, "altText": "Mi látszik a képen" }],
      "tags": ["pillar:debate"],
      "notes": "belső megjegyzés"
    }
  ]
}
```

| Mező | Szabály |
|---|---|
| `section` | `kep`, `video`, `social`, `terv`, `linkedin`, `reddit` — csak ami a projektnél engedélyezett (LinkedIn projekt: `linkedin`, `reddit`; KT: `kep`, `video`, `social`, `reddit`) |
| `platforms` | `instagram`, `facebook`, `tiktok`, `linkedin`, `youtube`, `x`, `threads` (`terv`-nél lehet `[]`) |
| `status` | `scheduled` (alap) vagy `draft` |
| `scheduledAt` | ISO dátum **időzónával**: `2026-11-03T18:00:00+01:00` |
| `media` | max. 20; `kep`-hez kell kép, `video`-hoz videó; videó borítója `"role": "cover"` |

**Duplikáció ellen:**
- `batchId` — futásonként egyedi (`{automationId}:{runId}`). Hiba után **ugyanazzal a batchId-val és bodyval** küldd újra: a szerver a korábbi választ adja (`replayed: true`), nem ment kétszer. Ugyanaz a batchId más tartalommal: `409`.
- `replaceRange` (opcionális, előre generált csomag **újragenerálásához**): `"replaceRange": { "from": "2026-11-02", "to": "2026-11-15" }` (budapesti dátumok, mindkét vég benne van). Ebben a tartományban az **ugyanettől az `automationId`-tól** jött, a batchben nem szereplő `draft`/`scheduled` posztok archiválódnak (nem törlődnek, csak eltűnnek a nézetből). Más automatizáció posztjait nem érinti. A válasz `archived` listája mutatja, mi került ki.
- `externalId` — a poszt helyéből képzett, **nem véletlen** azonosító (projekt + nap + szekció + sorszám). Ha egy új futás ugyanazt az `externalId`-t küldi, a poszt **frissül**, nem duplikálódik. Ugyanarra a napra jövő új `externalId` hozzáadódik.

Válasz: `201 { batchId, replayed, items: [{ externalId, result: "created" | "updated", postId }], archived: [{ externalId, postId }] }`.
Hibák: `401` kulcs, `400` rossz JSON, `409` batchId újrahasználva, `422` `VALIDATION_FAILED` / `MEDIA_INVALID` (az `issues` mezőben a pontos hely, pl. `posts[3].media[0].key`). 422-nél **semmi nem mentődik**: javítsd és küldd újra.

R2 CORS beállítás nem kell, mert nem böngészőből megy a feltöltés.

## Kitelepítés (Vercel)

1. Env változók feltöltése (egyszer, a projekt mappájából):
   ```bash
   for k in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET UPLOAD_API_KEY MONGODB_URI HUB_PASSWORD; do
     grep "^$k=" .env.local | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/' | tr -d '\n' | vercel env add $k production --force
   done
   ```
2. MongoDB Atlas → Network Access → **Add IP Address → Allow access from anywhere (0.0.0.0/0)**, mert a Vercel IP-címei változnak.
3. `vercel deploy --prod`

## Felépítés

- `lib/projects.tsx` — a projektek listája. **Új projekt = új sor ebben a tömbben.**
- `components/AppShell.tsx` — alsó tab sáv, `--accent` szín, utolsó projekt mentése.
- `components/ProjectPosts.tsx` — szekció gombok (Kép/Videó/Social/Terv) + posztkártyák, csak olvasás.
- `lib/posts.ts` — a batch validációja. `lib/mongo.ts` — Mongo kapcsolat + indexek.
- `app/api/upload/route.ts` — API kulcsot kér, ellenőrzi a típust (kép/videó) és a méretet (max. 100 MB), majd 5 percig érvényes feltöltési URL-t ad.
- `app/api/posts/batch/route.ts` — posztok mentése (idempotens upsert).
- `app/api/posts/route.ts` — egy projekt posztjai a UI-nak (belépés kell).
- `proxy.ts`, `lib/session.ts`, `app/login/page.tsx` — jelszavas belépés.
