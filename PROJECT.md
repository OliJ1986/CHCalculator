# CHill — projekt

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a feltöltött dokumentáció szerinti lezárt történet. M1.3, M2, M3 és M4: **TODO**, ebben a dokumentációs munkában implementáció és új alkalmazásteszt nem történt. Következő feladat: **M1.3**, majd M2 → M3 → M4. A korábbi tesztszámok és élő eredmények történeti bizonyítékok, nem a mostani kód független ellenőrzései.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

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

M2 kalkulátor bővítése, M3 napló, M4 célok/étkezések, M5 saját ételek/kedvencek/receptek, M6 vonalkód/OCR, M7 AI funkciók.

## Jóváhagyott következő scope: M1.3–M4 [terv]

M1.3 PostgreSQL-re viszi a fejlesztést, Alembic-sémakezeléssel és adatvesztést kizáró, ellenőrzött SQLite cache-importtal. Külön dev/test/prod DB kötelező; Railway-telepítés előkészül, valódi deploy nem történik ebben a scope-ban.

M2 a meglévő CH-flow-t teszi teljes kalkulátorrá: gramm, gyors mennyiségek, azonnali és pontos eredmény, források megkülönböztetése, hiányzó adat és hibás input kezelése. Nem új CH-definíció és nem egységes alapanyag-katalógus.

M3 a mock/frontend-state napi listát valódi, tartós naplóra cseréli. A mentéskori tápanyag-pillanatkép védi a múltbeli számításokat a külső adatváltozásoktól. Dátum, időpont, szerkesztés, törlés és napi összeg része a feladatnak. Egy privát profil az alap; nyilvános, többfelhasználós szolgáltatás és teljes offline szinkron külön scope.

M4 felhasználói napi és opcionális étkezésenkénti célokat ad, hatálynapokkal és múltmegőrzéssel. Kategóriák: reggeli, tízórai, ebéd, uzsonna, vacsora, egyéb. A CHill nem ajánl orvosi vagy étrendi célértéket, és nem kezeli valódi célként a prototípus 160 g értékét.

Az M0 Non-goals kizárólag M0-ra vonatkozik. M5–M7, receptek, OCR, AI, új katalógus és új autentikációs termék nem része az autonóm megvalósításnak. Részletes viselkedés, bemeneti szabályok, időzóna- és célkezelés: `TASKS.md`.
