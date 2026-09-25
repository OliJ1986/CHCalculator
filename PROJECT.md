# CHill — projekt

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**; M5 kódja elkészült, de a böngészős UI-kapu miatt **IN PROGRESS**. M8–M11 katalógus/tervező kód és automatizált kapuk elkészültek, böngészős mobil QA miatt **IN PROGRESS**.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

## Cél

A CHill egy mobil-first, gyors szénhidrátszámláló PWA. Az alap use case: a felhasználó kikeres egy ételt, megadja a grammot, és azonnal megkapja a kiszámolt CH-értéket.

## UX-filozófia

Egy pillantással érthető állapot, kevés döntés, nagy touch targetek és nyugodt, prémium fogyasztói mobil UI. A vizuális minőség elsőrangú termékkövetelmény.

## M0.1 — Visual Identity & UI Polish

A végleges felhasználói név **CHill**, a vizuális irány **Fresh Premium**: meleg törtfehér háttér, visszafogott korall CTA, pisztácia progress accent, mély grafit/padlizsán daily surface, erős numerikus hierarchia és kevés információs zaj.

## M0.2 — Final UI Cleanup & M0 Closure

Az M0 utolsó polish köre eltávolította a funkció nélküli motivációs kártyát és csökkentette a generikus, uppercase jellegű feliratokat. A daily hero sorrendje az aktuális és hátralévő CH-t helyezi előre, a desktop shell pedig finom felületkeretet kapott a mobil-first struktúra megtartásával. M0 lezárva; az M1 továbbra is TODO.

## M1.1 — Food domain + Open Food Facts integráció

Az M1.1 a lezárt M0 működő flow-ját megtartva belső Food domaint, provider absztrakciót, Open Food Facts alapú keresést, SQLite cache-t és backend barcode lookup alapot ad. A frontend egységes CHill Food DTO-t kap; az OFF nyers JSON-ja nem szivárog ki a UI-ba. A központi mező `available_carbs_100g`, amelyből a determinisztikus `amount_g × available_carbs_100g / 100` számítás készül.

## M1.2 — USDA FoodData Central + generikus ételek

Az M1.2 az OFF mellé USDA FoodData Central providert, kis magyar query-alias réteget és determinisztikus aggregátor/ranking logikát ad. Az M1.2.1 ezt szándék- és kategória-alapú rangsorolással pontosítja: egyszerű alapanyagkeresésnél a releváns alapanyag előnyt kap, összetett keresésnél minden lényeges token és a márka számít; az adatforrás önmagában nem ad pontelőnyt. Az USDA `carbohydrate, by difference` értékéből csak megbízható dietary fiber adattal készül `available_carbs_100g = total_carbohydrate_100g - dietary_fiber_100g`; hiányzó rost esetén a találat nem számolható automatikusan.
M1.2 státusza DONE: a konfiguráció betöltése kulcsérték megjelenítése nélkül igazolt, a provider-hibák diagnosztikája és korlátozott retry-kezelése elkészült, a hat keresésből álló élő combined USDA/OFF smoke sikeres.

## M1.2.2 — USDA tápanyagadatok és találatnevek ellenőrzése

Az M1.2.2 diagnosztikája szerint a különböző banánkeresési értékek különböző USDA FDC-rekordokból származnak, és az adott rekordok 1005-ös total carbohydrate és 1079-es dietary fiber értékeiből helyesen számolódnak. A névütközést a korábbi, túl tág `banana + raw` magyar leképezési minta okozta, amely a banana pepper rekordokat is „Banán, nyers” néven jelenítette meg. A javítás forrásnév-alapú, megkülönböztető címkéket, nutrient-provenance metaadatot és célzott USDA cache-migrációt használ; gyanús, például fiber > total értékből nem készül számított eredmény.

## M1.2.3 — USDA és Open Food Facts integráció stabilizálása

A diagnosztika feltárta, hogy a USDA `/foods/search` kérésben ismételt `dataType` query-paraméterek egyes kereséseknél HTTP 400-at okoztak. A keresés POST JSON törzsre váltott, amely a `dataType` értékeit tömbként adja át; a részletes `/food/{fdcId}` kérés GET maradt. Ez összhangban van a USDA keresési API dokumentált POST formájával ([USDA API Guide](https://fdc.nal.usda.gov/api-guide/)).

Az OFF keresés a normalizált queryt használja, így az ékezetes összetett `Activia banán` keresés stabil provider-queryt kap. A 429, 5xx, timeout és hálózati hibák korlátozott exponenciális retry-t kapnak; HTTP 400 és hitelesítési hiba esetén nincs változatlan automatikus újrapróbálás. A provider-hibák egymástól izoláltak, ezért az egyik szolgáltató kiesése nem állítja le a másikat vagy a cache-visszaadást.

A diagnosztikai események forrást, request type-ot, HTTP metódust, keresési kifejezést, státuszt, hibatípust, válaszidőt, próbálkozási sorszámot és retry állapotot rögzítenek; URL-eket és titkos paramétereket nem naplóznak. A keresési összesítő külön jelzi a cache-, friss USDA- és friss OFF-találatokat.

Az élő ellenőrzés a `banán`, `alma`, `rizs`, `csirkemell`, `banánpaprika` és `Activia banán` kereséseket futtatta le. Mind a hat combined endpoint 200-as választ adott; az USDA és OFF friss számlálói, a magyar és eredeti nevek, a CH-értékek, a kategóriák és az FDC/source deduplikáció ellenőrizve lettek. Az OFF időszakos 503 válaszai a retry-keretben több alkalommal helyreálltak; végső provider-hiba nem maradt a lezáró futásban. A rizs- és csirkemell-találatoknál az első helyezések szolgáltatói adat- és kategóriafüggő feldolgozott rekordok lehetnek, miközben az eredeti angol név megmarad a megkülönböztetéshez.
A külön provider smoke az USDA hat keresését és az OFF által elérhető öt keresését külön is ellenőrizte; a banánpaprika egyik szolgáltatónál sem adott új OFF rekordot, ezért a combined eredményben a meglévő USDA/cache sorok maradtak.

## M1.3 — PostgreSQL / Alembic / biztonságos cache-import — lezárva

Az alkalmazás most explicit `DATABASE_URL`-t használ, és a PostgreSQL-séma forrása az Alembic. Prod környezetben hiányzó adatbázis-url egyértelmű hibát ad; a lokális SQLite fallback csak dev/test fejlesztési kompatibilitás, nem rejtett prod-visszaesés. Elkészült az `0001_initial_foods` Alembic-revízió, a dev/test/prod példakonfiguráció és a Railway pre-deploy `alembic upgrade head`/healthcheck előkészítése.

Az import eszköz csak explicit dev/test célba enged, a SQLite-forrást read-only módban auditálja, backup API-val konzisztens másolatot készít, SHA-256 és canonical rekord-digestet ellenőriz, alapértelmezésben dry-run, és csak teljes rekord-, nutrient-, JSON-, NULL/0- és source/source_id egyezés után ír. Azonos tartalom idempotensen kihagyható; eltérő tartalom konfliktus és tranzakciós rollback. A tényleges `backend/chill.db` 341 rekordos és a létrehozott backup canonical digestje megegyezik.

Két külön helyi PostgreSQL 18 adatbázison (`chill_dev`, `chill_test`) az Alembic `upgrade head` és az ismételt futás sikeres. A tényleges 341 rekordos SQLite-cache dry-runja nem írt; a `chill_dev` import teljes rekord-, nutrient-, JSON-, NULL/0- és source/source_id egyezéssel, azonos canonical digesttel sikeres. A PostgreSQL CRUD, idempotencia, konfliktusos import és rollback ellenőrzése sikeres, a forrás és backup változatlan maradt. A regresszió 48 backend tesztből, frontend typecheckből, lintből, 4 unit tesztből és production buildből állt.

## M2 — Teljes CH-kalkulátor — lezárva

A CH-számítás backend- és frontend-oldalon determinisztikus, kerekítés nélküli értékből indul, a megjelenítés egy tizedesre formáz. A mennyiség 0-nál nagyobb, véges és legfeljebb 100 000 g lehet; a 0–100 g/100 g közötti CH-adat, beleértve a valid 0-t, számolható. A hiányzó vagy érvénytelen CH és minden hibás mennyiség tiltja a mentést. A frontend elfogadja a magyar tizedesvesszőt és a pontot, és a `POST /api/carbs/calculate` szerződés ugyanezt a numerikus szabályt ellenőrzi. A mobil keresés–kiválasztás–mennyiség–eredmény flow 390 és 360 px szélességen túlcsordulás nélkül működik.

## M8–M11 — Saját katalógus, receptek, tervező és bevásárlólista

A saját ételek és receptek a regisztrált profilhoz kötött PostgreSQL-adatok, vendég módban pedig additive IndexedDB-tárban élnek. A recept minden hozzávalóról CH-snapshotot őriz, így a korábbi receptnapló külső adatfrissítéstől nem változik. A tervező külön kezeli a jövőbeli tervet és a tényleges naplót; a bevásárlólista kézi és tervből generált tételeket kezel, mértékegység-kompatibilis aggregációval.

Az új backend migrációk `0006_custom_foods`–`0009_shopping_list`, a frontend tároló verziója 2. A funkcionális és PostgreSQL tesztek sikeresek, de az új mobil UI böngészős ellenőrzése a környezetben elérhető browser runner hiánya miatt még nyitott.

## M0 scope

- működő React/Vite/TypeScript SPA és PWA-alapok
- „Ma” képernyő mock napi összesítővel és bejegyzésekkel
- mobil bottom navigation, desktopon középre zárt app-keret
- kétlépéses étel-hozzáadás backendről érkező keresési eredményekkel
- determinisztikus CH-kalkuláció és unit tesztek
- light/dark theme toggle
- minimális FastAPI backend és `/api/health`

## Non-goals

M0-ban nincs perzisztencia, valódi food adatbázis, autentikáció, célkezelés, recept, OCR, vonalkód vagy AI funkció.

## Domain szabályok

`CH = elfogyasztott_mennyiség_g × CH_100g / 100`. A CH végleges forrása strukturált adat és determinisztikus programlogika; AI később sem írhatja felül ezt a szabályt.

## Későbbi mérföldkövek

M6 vonalkód/OCR, M7 AI funkciók.

## Megvalósított scope: M1.3–M5 [M5 kód elkészült, UI-kapu nyitott]

M1.3 PostgreSQL-re viszi a fejlesztést, Alembic-sémakezeléssel és adatvesztést kizáró, ellenőrzött SQLite cache-importtal. Külön dev/test/prod DB kötelező; Railway-telepítés előkészül, valódi deploy nem történik ebben a scope-ban.

M2 a meglévő CH-flow-t teszi teljes kalkulátorrá: gramm, gyors mennyiségek, azonnali és pontos eredmény, források megkülönböztetése, hiányzó adat és hibás input kezelése. Nem új CH-definíció és nem egységes alapanyag-katalógus.

M3 a mock/frontend-state napi listát valódi, tartós naplóra cseréli. A mentéskori tápanyag-pillanatkép védi a múltbeli számításokat a külső adatváltozásoktól. Dátum, időpont, szerkesztés, törlés és napi összeg része a feladatnak. Egy privát profil az alap; nyilvános, többfelhasználós szolgáltatás és teljes offline szinkron külön scope.

M4 felhasználói napi és opcionális étkezésenkénti célokat ad, hatálynapokkal és múltmegőrzéssel. Kategóriák: reggeli, tízórai, ebéd, uzsonna, vacsora, egyéb. A CHill nem ajánl orvosi vagy étrendi célértéket, és nem kezeli valódi célként a prototípus 160 g értékét.

## M4 megvalósult állapot

A `GoalVersion` modell és az `0003_goal_versions` migráció profilhoz kötött, hatálynapos napi/rész-célokat kezel. A `/api/goals` és `/api/goals/summary` szerveroldali validációval, hat kategóriával, hiányzó célállapottal és történeti visszakereséssel működik. A frontend dátumváltást, cél-szerkesztést, múltbeli megerősítést, eltérésjelzést és kategória-összesítést ad. Az M4 kapui a valódi `chill_test` PostgreSQL-en, a frontend builden és a 390/360 px mobil renderben sikeresek.

## M3 megvalósult állapot

Az étkezési napló PostgreSQL/Alembic alapon perzisztens. A `/api/meals` létrehoz, listáz helyi nap szerint, módosít és töröl; a mentéskor szerveroldali tápanyag-snapshot és determinisztikus CH kerül az adatbázisba. Egy rögzített, szerver által kiválasztott profil használható; auth és teljes offline szinkron továbbra sem része a scope-nak. Az M4 célok és kategóriák elkészültek.

Az M0 Non-goals kizárólag M0-ra vonatkozik. M6–M7, receptek, OCR, AI, új katalógus és új autentikációs termék nem része az autonóm megvalósításnak. Részletes viselkedés, bemeneti szabályok, időzóna- és célkezelés: `TASKS.md`.



## M5 megvalósult állapot

Az M5 vendég IndexedDB naplót és regisztrált user réteget ad. A meal/goal API hitelesített user profile-t használ, a vendégimport explicit, idempotens és megőrzi a snapshotot, időzónát, helyi napot és célverziót. Email-delivery adapter és valós Railway deploy nyitott üzemeltetési lépés.

### M12 állapot
A mobil UX 2.0 automatikus kapui teljesültek; böngészős mobil és PWA QA környezeti okból nyitott.
