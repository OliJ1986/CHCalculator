# Architektúra

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**; M5 és M8–M11 kódja elkészült, a böngészős UI-kapu miatt **IN PROGRESS**.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

## Frontend

`frontend/` egy React + TypeScript + Vite SPA. A képernyő- és flow-logika jelenleg kis komponensekben az `src/App.tsx`-ben marad; a tiszta domain-számítás az `src/lib/carbs.ts`, a backend adapter az `src/api/foods.ts` alatt van. React Router kezeli a későbbi oldalak helyét, TanStack Query a valódi food keresés cache- és loading állapotait kezeli.

## Backend

`backend/app/` egy FastAPI alkalmazás. A konfiguráció `config.py`, az SQLAlchemy engine és session `db.py`, a Food ORM modell a `models.py`, a HTTP belépési pont `main.py`. Az explicit `DATABASE_URL` választja ki a külön dev/test/prod adatbázist; prodban hiányzó URL hibát ad. A lokális SQLite fallback csak dev/test kompatibilitási út, PostgreSQL esetén az alkalmazás nem végez `create_all` vagy ad hoc DDL-t.

## Food domain és provider réteg

Az `app/domain/foods.py` belső `FoodCandidate` DTO-ja és az `app/models.py` `Food` ORM modellje nem provider-specifikus. A CHill elsődleges tápértékmezője az `available_carbs_100g`; hiányzó vagy 0–100 tartományon kívüli érték `None`, és a frontendben nem számolható találatot jelent. Az OFF és USDA mapping külön, egy-egy jól tesztelhető helyen történik. A `name` a megjelenítési név, az `original_name` a forrás neve, a `category` pedig stabil `ingredient`/`processed`/`packaged`/`other` kulcs.

Az `app/providers/base.py` `FoodProvider` protokollja a `search`, `get_by_id` és `get_by_barcode` műveleteket definiálja. Az `OpenFoodFactsProvider` teljes szöveges kereséshez a dokumentált OFF keresési végpontot, barcode lekéréshez az API v3 product endpointot használja, korlátozott mezőlistával és CHill User-Agenttel. A `USDAProvider` a FoodData Central `/foods/search` és `/food/{fdcId}` endpointjait használja, csak configból kapott API key-jel, generikus data type szűréssel és stabil nutrient ID mappinggel. A USDA mapper a `source_payload` mezőben megőrzi a FDC-azonosítót, eredeti angol nevet, adattípust, kategóriát, mapping-verziót, valamint a 1005 total carbohydrate és 1079 dietary fiber azonosítókat és nyers értékeket.
Az USDA keresés POST JSON törzsben küldi a tömbös `dataType` szűrőt, mert az ismételt query-paraméterezés HTTP 400-at okozhat. Az OFF query normalizált; mindkét provider a közös `providers/http.py` rétegen keresztül kér JSON-t, amely a 429/5xx, timeout és hálózati hibákra korlátozott exponenciális retry-t, 400-as és hitelesítési hibákra retry-tiltást, valamint kulcsmentes diagnosztikát ad.

## Cache és adatfolyam

Kereséskor a `FoodService` először normalizált név/brand alapján SQLite cache-ben keres, majd combined módban a cache méretétől függetlenül párhuzamosan meghívja az összes providert, hogy a USDA generikus találatai ne vesszenek el OFF/cache eredmények miatt. A válaszok belső `FoodCandidate` objektumokra mapelődnek, source/source_id alapján upsertelődnek, majd a cache és az új eredmények egységes listaként mennek vissza. A `source_payload` minimális OFF/USDA forrásmetaadatot őriz diagnosztikához. Induláskor a `USDA_MAPPING_VERSION` alapján célzott migráció frissíti a régi USDA-megjelenítési metaadatot rekordtörlés nélkül. A barcode flow ugyanezt a cache-first logikát használja.
Az összesítő log külön jelzi a cache-ből, friss USDA-ból és friss OFF-ból származó elemszámot. Provider-hiba esetén a már meglévő cache találatai továbbra is visszaadhatók, miközben a hibás friss lekérés diagnosztikai eseményként megmarad.

## Adatbázis-séma és cache-import

PostgreSQL-ben az Alembic az egyetlen sémavezető (`backend/alembic/versions/0001_initial_foods.py`); alkalmazásindulás nem módosít PostgreSQL-sémát. A `backend/app/tools/cache_import.py` kézi, explicit dev/test importot biztosít SQLite → PostgreSQL irányban. A forrás read-only, a backup SQLite backup API-val készül, és az import csak teljes canonical rekordegyezés, source/source_id-egyediség és visszaolvasási ellenőrzés után commitol. Konfliktus, eltérés, prod-cél vagy ismeretlen forrástábla esetén a művelet elutasított és nem ír.

## Frontend/backend határ

Az `/api/foods/search?q=` backend egységes Food DTO-t ad, az `/api/foods/barcode/{barcode}` pedig előkészíti a barcode lookupot kamera nélkül. A `POST /api/carbs/calculate` ugyanazt a determinisztikus, pozitív gramm- és 0–100 g/100 g CH-validációt adja, mint a frontend `src/lib/carbs.ts`; a szerver kerekítés nélkül számol. A `FoodService` cache-first módon, párhuzamos USDA/OFF provider hívásokkal, provider hibaizolációval, source/source_id deduplikációval és szándékfüggő, determinisztikus rankinggel aggregál. Az egyszerű ismert alapanyagoknál az alapanyagkategória és a pontos névegyezés előnyt kap; összetett lekérdezésnél minden token és a márka relevanciája számít. A frontend `src/api/foods.ts` rétege a snake_case API választ belső camelCase modellre alakítja; az App nem ismeri az OFF vagy USDA JSON-t. Fordított magyar megjelenítési név esetén az eredeti forrásnév másodlagos szövegként is megjelenik, hogy a hasonló találatok megkülönböztethetők maradjanak. A keresés TanStack Query-vel, minimum két karakterrel és 300 ms debounce-zal működik.

## PWA

Az alkalmazás a `public/manifest.webmanifest` manifestet és a `public/sw.js` egyszerű cache-first service workert használja; a regisztráció a frontend belépési pontján történik. Az ikon és a theme metadata a `public/` része. M0 nem ígér teljes offline adatkezelést.

## Adatfolyam

Étel keresése → query normalizálás/alias → lokális Food cache → USDA + OFF provider → mapping/upsert → deduplikáció/ranking → backend Food DTO → frontend kiválasztás → gramm bevitele → `calculateCarbohydrate` → kerekített UI érték → frontend state-ben új napi bejegyzés.

## M1.3–M4 célarchitektúra [M1.3–M4 kész]

### Adatbázis és migráció

A React/Vite és FastAPI/SQLAlchemy stack marad. Az M1.3 utáni alkalmazás PostgreSQL-t használ; SQLite csak megőrzött importforrás. Külön DATABASE_URL dev és prod konfigurációban, külön TEST_DATABASE_URL a tesztfuttatásban; az elnevezéseket a tényleges configgal össze kell hangolni, titokmentes .env.example-ban dokumentálva. Tesztfuttatás előtt célazonosság- és környezetellenőrzés kell, destruktív fixture csak dedikált test DB-ben futhat.

Alembic kezeli a sémát: M1.3 Food/cache alap, M3 napló/profil, M4 célverziók. Az upgrade ne fusson minden worker indulásakor. Az autogenerate eredménye ellenőrizendő; schema-migráció és mapping_version alapú cache-adatfrissítés külön felelősség. Meglévő adatbázist ellenőrzés nélkül nem szabad head-re stampelni. Destruktív downgrade helyett dokumentált, kipróbált backup/restore vagy előre javítás; downgrade-teszt csak eldobható DB-n.

Az importeszköz az alkalmazásindítástól és deploytól külön működik: konzisztens SQLite-backup → dry-run/leltár → tranzakciós import → teljes mező- és kulcsellenőrzés → commit → visszaolvasás. A source/source_id egyedi kulcs megmarad. Konfliktus nem automatikus upsert-felülírás. A SQLite-ból érkező timezone nélküli UTC-időbélyegek importkor UTC-ként kerülnek PostgreSQL-be, összehasonlításkor pedig az eltérő timezone-ábrázolások UTC-re normalizálódnak. A teljes algoritmus és tesztkapu a TASKS M1.3 része.

### Napló és célok tervezett modellje

- Profile: privát egyfelhasználós azonosító, IANA-időzóna. A szerver választja ki, kliens nem válthat jogosulatlan profilt.
- MealEntry: profil, UTC consumed_at, rögzített local_date/timezone, amount_g, meal_category, snapshot, számított CH, létrehozás/módosítás ideje és idempotenciakulcs. Index profil+helyi napra; idempotenciakulcs profilon belül egyedi. Food kapcsolat opcionális és nem kaszkádolja a napló törlését.
- Snapshot: név/eredeti név, márka, source/source_id, pontos 100 g-os nutrientek és provenance, mapping/calculation verzió. A backend validált forrásból készíti; mennyiségváltozáskor ebből számol, ételcserénél új snapshotot rögzít.
- GoalVersion: profil+effective_from nap szerint egyedi, nullable napi cél és opcionális étkezési célok együtt verziózva. A nap a legutolsó érvényes verziót használja. NULL cél nincs beállítva; nem nulla. Visszamenőleges változás csak explicit hatálymódosítás.

Numerikus tárolás és számítás: Decimal/Numeric, forrásértékek veszteségmentes kezelése és dokumentált méretezés; ne az egy tizedesre kerekített UI-szám legyen a tárolt tápanyag vagy összesítési alap. Frontend és backend ugyanazokat a számolási példákat teljesítse. Backend a tartós összeg hiteles számítója.

### API és kliens

Tervezett szerződés (pontos route-neveket a megvalósításkor rögzíteni): napló GET nap szerint, POST új tétel, PATCH tétel, DELETE tétel; napi összesítő; hatálynapos cél GET/mentés. Validációs hibák és nem létező/tiltott rekordok egyértelmű válaszok. Mutáció után TanStack Query invalidálja az érintett régi és új napot is. Snapshotot/összeget a kliens nem írhat felül ellenőrzés nélkül. Offline írás sorba állítása nincs ebben a scope-ban.

M3-tól a flow: kiválasztás → gramm/előnézet → szervervalidáció és snapshot → tranzakciós mentés → szerverösszesítő → UI. M4-ben ehhez a napra hatályos cél és kategóriaösszegek társulnak. A service worker csak a megfelelő statikus erőforrásokat cache-elje; személyes API-adat ne kerüljön általános cache-first tárolóba.

### M4 tényleges komponensei

- A `GoalVersion` és az `0003_goal_versions` migráció a profil + hatálynap egyediségét, nullable napi célt és JSON rész-célokat tárol; egy PUT tranzakcióban ír vagy tombstone-olja a célverziót.
- A `goals` service a legutolsó, nem későbbi verziót választja, a múltbeli írást `allow_past` nélkül elutasítja, és `Decimal` alapú kategória-/napi összesítést ad. A progress arány adatérték, a vizuális sáv 0–100%-ra clampelt.
- A frontend `src/api/goals.ts` adaptere és az `App.tsx` cél-lapja ugyanazokat a stabil kategóriakulcsokat használja. A dátumnavigáció külön napra kérdezi le a naplót és az összesítőt; személyes API-adatot a service worker nem cache-el.

### M3 tényleges komponensei

- Az Alembic `0002_meal_log_snapshot` a `profiles` és `meal_entries` táblát, a profil+idempotencia egyediséget és a profil+helyi nap indexet hozza létre.
- A `MealEntry` a `Food`-ra opcionális `SET NULL` kapcsolattal mutat; a bizonyító snapshot JSON-ban önállóan őrzi a neveket, forrásazonosítókat, CH/rost- és nutrient-provenance adatokat, mapping- és számítási verziót.
- A `meals` service minden írásnál szerveroldalon validál, UTC-re normalizál, a rögzített IANA-zóna szerinti napot tárolja, és a régi snapshotból számol mennyiségmódosításkor. A frontend csak szerver által visszaadott naplót és összesítést jelenít meg.

### Railway-előkészítés

Tervezett külön backend és PostgreSQL szolgáltatás, környezetenként külön adatbázissal. A DATABASE_URL a szolgáltatás titkos változója; helyi fejlesztés nem használ prod kapcsolatot. Pre-deploy: Alembic upgrade head; start: az alkalmazás a platform PORT-ján figyel, healthcheck és szűk CORS-beállítás tartozik hozzá. A migráció és régi/új alkalmazás együttélését kompatibilis, additív változtatásokkal kell tervezni. Az importot nem futtatjuk minden deploynál. Backup és visszaállítás leírás szükséges a valós éles átállás előtt.

Privát, auth nélküli naplót nyilvánosan nem telepítünk. Az M1.3 csak előkészítést vállal, sem Railway-üzemelést, sem éles migrációt nem állít késznek.

Hivatalos műszaki hivatkozások a terv ellenőrzéséhez: [Alembic tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html), [autogenerate és kézi ellenőrzés](https://alembic.sqlalchemy.org/en/latest/autogenerate.html), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql), [Railway pre-deploy](https://docs.railway.com/deployments/pre-deploy-command). A pre-deploy a build és az alkalmazás indítása között fut, környezeti változókkal és privát hálózati hozzáféréssel; a pontos projektkonfiguráció a megvalósításkor ellenőrizendő.

## Railway staging tényleges felépítése

A staging három elkülönített Railway-szolgáltatásból áll: PostgreSQL, privát hálózaton futó FastAPI backend és publikus, vendégként megnyitható React/Node frontend gateway. A backend szolgáltatás gyökérkönyvtára `/backend`, migrációs pre-deploy parancsa `alembic upgrade head`, indítása az `$PORT` porton történik, readiness útvonala `/api/ready`. A frontend gyökérkönyvtára `/frontend`; a build `npm ci && npm run build`, az indítás `npm start`, a healthcheck `/healthz`.

Stagingben a backend middleware a `/api/ready` kivételével minden kérést `STAGING_PROXY_TOKEN` fejléc-ellenőrzéshez köt. A frontend runtime gateway hitelesítés nélkül szolgálja ki a statikus vendégalkalmazást, a privát `BACKEND_URL`-re proxyz, és csak szerveroldalon adja hozzá a tokent. A publikus backend domain szándékosan nincs létrehozva, így a default-profile adatai nem kerülnek közvetlenül internetre; a személyes API-k ezen felül user sessiont és CSRF-et ellenőriznek. A service worker `/api/` útvonalat nem cache-el, csak statikus erőforrásokat tárol.

A teljes Railway felületi eljárás, változólista, ellenőrzőlista és visszavonási lépések a `RAILWAY_STAGING.md` fájlban találhatók. A staging konfiguráció előkészített, de tényleges Railway-projekt, hozzáférés, titkos értékek és deploy nélkül marad.



## M5 architektúra — vendég és felhasználói réteg

A User és Profile.user_id köti a meal/goal adatot tulajdonoshoz; a régi default-profile user nélkül megmarad. A UserSession, verification/reset token és LoginAttempt migrációval készül. A session cookie HttpOnly/SameSite, a DB csak digestet tárol, külön CSRF-cookie/header ellenőrzött, staging/prod módban Secure. A jelszó szabványos hashlib.scrypt.

A vendég data layer az IndexedDB chill-guest-v1 tárban dolgozik: a lekérdezés három napra korlátozott, exportkor minden rekord megmarad. A /api/auth/import-guest szerveroldali CH-számolással és guest:<id> idempotenciakulccsal tranzakciós; helyi törlés csak siker után.
# M8–M11 bővítés — 2026-09-25

A profilhoz kötött saját ételek, receptek, étkezéstervek és bevásárlótételek PostgreSQL-ben külön táblákban élnek (`custom_foods`, `recipes`, `recipe_ingredients`, `meal_plan_entries`, `shopping_items`). Minden recept- és naplóbejegyzés számítási snapshotot rögzít, ezért a későbbi katalógus-frissítés nem írja át a múltat. A vendég mód ugyanennek a minimális adatmodellnek az IndexedDB 2-es, additive tároló-verzióját használja; a háromnapos naplóablak csak megjelenítési korlát.

Az API-k minden személyes lekérdezést hitelesített user profiljára szűrnek, módosításkor CSRF-védelmet használnak. A tervező különálló domain a tényleges naplótól, a bevásárlólista aggregációja név és kompatibilis egység szerint történik. Az új Alembic revíziók sorrendje `0006_custom_foods` → `0007_recipes` → `0008_meal_plans` → `0009_shopping_list`.

## M12 mobil navigáció
A frontend alsó navigációja öt fix célból áll; a Hozzáadás elem lokális sheetet nyit, a személyes adatok továbbra is a meglévő guest IndexedDB vagy hitelesített API rétegen mennek át.

## M13 receptszámítás
A recept API a hozzávalók pillanatfelvételéből számol; a főtt CH/100 g kizárólag explicit total_weight_g esetén készül, a nyers összegből nincs becslés.

## M14 heti tervezés
A terv és a napló külön marad; a heti UI tartományos tervlekérést használ, a copy végpont azonos tartalomra idempotens, a planner bevásárlólista-generálás pedig a kézi tételeket érintetlenül hagyja.
