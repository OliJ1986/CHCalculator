# Changelog

## Unreleased — M8–M11 saját katalógus, tervezés és bevásárlólista — 2026-09-25

- Profilhoz kötött saját étel CRUD és kedvenc kezelés készült szerveroldali CH-validációval; vendég módban az adatok IndexedDB-ben maradnak.
- A receptek hozzávaló-snapshotból számítják az össz- és adagonkénti CH-t, a recept étkezésként naplózható gramm vagy adag szerint.
- Napi étkezéstervező és bevásárlólista API készült, a tervből generált tételek csak azonos név és kompatibilis egység esetén aggregálódnak.
- Az Alembic `0006`–`0009` migrációk és a lokális SQLite additive kompatibilitás elkészült; dev/test PostgreSQL head ellenőrizve.
- A vendég IndexedDB 2-es verziója additive módon tárol saját ételeket, recepteket, terveket és bevásárlótételeket; a korábbi napló/cél adatok megmaradnak.
- A vendég saját ételek regisztráció után explicit megerősítéssel, idempotens szerveroldali importtal átvihetők; a tervezett étkezés külön művelettel kerülhet a naplóba.
- Ellenőrzés: izolált `chill_test` PostgreSQL-környezettel teljes backend `83 passed`, frontend 9 unit teszt, typecheck és build sikeres. A lint csak a korábbi React effect figyelmeztetéseit jelzi; browseres mobil QA nem futott böngésző hiányában.
- Korlát: a vendégimport jelenleg a naplókat, célokat és saját ételeket kezeli; a vendég receptek/tervek/bevásárlótételek helyben maradnak, külön import-szerződés nélkül.

## Unreleased — Railway staging előkészítés — 2026-09-25

- Külön Railway build/deploy konfiguráció készült a backendhez és a frontendhez; a backend Alembic pre-deploy migrációt és adatbázis-readiness healthchecket használ.
- Staging módban a backend PostgreSQL-t és proxy tokent követel, a frontend production Node gateway pedig regisztráció nélkül kiszolgálja a vendégalkalmazást és privát backend-címre proxyz.
- A frontend gateway Basic Auth függősége megszűnt; a `STAGING_BASIC_AUTH_USER` és `STAGING_BASIC_AUTH_PASSWORD` változók nem szükségesek.
- A gateway smoke ellenőrzi a Basic Auth nélküli statikus elérést, a szerveroldali proxy tokent és a kliens `Authorization` fejlécének eldobását.
- Megszűnt a runtime localhost API-fallback: a Vite fejlesztési proxy `VITE_DEV_API_URL` változóból olvas, a staging frontend `/api` same-origin útvonalat használ.
- A service worker cache-verziója frissült, és személyes `/api` válaszok többé nem kerülnek általános cache-first tárolóba.
- A Railway felületi telepítési és ellenőrzési útmutató a `RAILWAY_STAGING.md` fájlban található. Valós projekt, domain, deploy és adatimport nem történt.
- Ellenőrzés: backend `73 passed, 2 warnings`; frontend typecheck, lint, `7 passed` unit teszt, production build; helyi frontend- és FastAPI staging auth/readiness smoke sikeres.
- A szolgáltatás-root munkakönyvtárakat külön TOML-regressziós teszt rögzíti: backend `/backend` alatt nincs `cd backend`, frontend `/frontend` alatt nincs `cd frontend`; a repo-root fallback előtagja megmarad.
- A backendhez `backend/nixpacks.toml` és `.python-version` rögzíti a Python 3.12 + `requirements.txt` telepítést; a frontend Node 22.12.0 engine/nvmrc beállítást kapott.
- A frontend Railway build parancsa `npm run build` lett, mert a Nixpacks install fázisa már futtatja az `npm ci`-t; az egyszeri `NO_CACHE=1` tiszta build eljárását a staging útmutató dokumentálja.
- A Railway backend `preDeployCommand` értéke TOML-tömbre váltott (`["alembic upgrade head"]`), mert a korábbi stringes alak mellett a staging konténer migráció nélkül indult, és helyesen leállt hiányzó PostgreSQL-séma miatt.
- A backend start-parancsa idempotens `alembic upgrade head && uvicorn ...` védelmi tartalékot kapott arra az esetre, ha egy Railway deployment kihagyná a pre-deploy lépést.

## 0.4.0 — M4 saját CH-célok és étkezési kategóriák — 2026-09-25

- Az `0003_goal_versions` migráció napra hatályos, profilhoz kötött napi és opcionális étkezési célokat tárol; a célok módosítása és törlése idempotens, a múltbeli naphoz explicit megerősítés kell.
- A napló hat stabil étkezési kategóriát kezel, a szerver kategóriánként és naponta a mentett CH-snapshotokból számol. A hiányzó cél nem nulla, a túllépés negatív maradékkal és 100%-ban korlátozott vizuális sávval jelenik meg.
- A mobil UI dátumnavigációt, cél-szerkesztést, rész-célokat, eltérésjelzést és kategória-részösszegeket kapott.
- Ellenőrzés: valós PostgreSQL-lel 70 backend teszt, frontend typecheck/lint/7 unit teszt/build és 390/360 px mobil render/interakció sikeres.

## 0.3.0 — M3 tartós étkezési napló — 2026-09-25

- Az Alembic `0002_meal_log_snapshot` migráció létrehozza a profil- és naplósémát PostgreSQL-en; a `/api/meals` létrehozás, listázás, módosítás, törlés és napi összesítés végpontjai szerveroldali validációval működnek.
- A mentés UTC időpontot, rögzített helyi napot/IANA-zónát, mennyiséget, `other` étkezési kulcsot, idempotencia-kulcsot, determinisztikus CH-t és teljes nutrient snapshotot őriz. Cache-frissítés vagy Food-törlés nem módosítja a korábbi bejegyzést.
- A frontend a mock lista helyett a valódi napló API-t használja, hiba/üres állapotot jelez, mentés után frissít, és szerkesztést/megerősített törlést biztosít; a korábbi fix 160 g cél nem jelenik meg valós adatként.
- A valódi `chill_test` PostgreSQL integráció, 66 backend teszt, frontend typecheck/lint/7 unit teszt/build és 390/360 px mobil QA sikeres.

## 0.2.9 — M2 teljes CH-kalkulátor — 2026-09-25

- A backend megkapta a `POST /api/carbs/calculate` determinisztikus számítási végpontot és a pozitív, véges gramm-/CH-validációt; a 0 CH érvényes, a hiányzó CH és hibás mennyiség nem menthető számítás.
- A frontend kalkulátor elfogadja a magyar tizedesvesszőt és pontot, gyorsgombokat és +/- lépést ad, az eredményt kerekítetlen belső értékből egy tizedesre jeleníti meg, és hibás inputnál letiltja a mentést.
- M2 mobil ellenőrzés 390 és 360 px szélességen sikeres, vízszintes túlcsordulás nélkül. Backend 62 teszt, frontend 7 unit teszt, typecheck, lint és production build sikeres.

## 0.2.8 — M1.3 PostgreSQL-integráció lezárása — 2026-09-25

- A helyi PostgreSQL 18 `chill_dev` és `chill_test` adatbázisokon az Alembic migráció, ismételt migráció, ORM CRUD, import dry-run, 341 rekordos éles dev-import, teljes visszaolvasás, idempotencia és konfliktusos rollback ellenőrzése sikeres.
- Az import UTC-normalizálással kezeli a SQLite timezone nélküli UTC-időbélyegeit, így a PostgreSQL timezone-os visszaolvasása nem okoz hamis rekordeltérést. A forrás SQLite és a konzisztens backup változatlan maradt.
- Az Alembic in-process futtatása nem tiltja le az alkalmazási/provider loggereket; ezt regressziós teszt igazolja.
- A teljes ellenőrzés 48 backend tesztet, frontend typechecket, lintet, 4 unit tesztet és production buildet tartalmazott. Valódi Railway-deploy és push nem történt.

## Unreleased — csak dokumentációs terv, 2026-09-24

- Összehangolt M1.3 PostgreSQL/Alembic/cache-import/Railway-előkészítési terv, külön dev/test/prod adatbázissal.
- Részletes M2 kalkulátor, M3 snapshot-napló és M4 felhasználói célok/étkezések, elfogadási feltételekkel és autonóm fejlesztési határokkal.
- Az M1.2.3 és minden korábbi kiadás történeti bejegyzése megmaradt. Az alábbi IN PROGRESS megjegyzések az adott korábbi kiadás állapotai.
- M1.3 előkészítő implementáció elkészült, de a valódi PostgreSQL-kapu hiánya miatt BLOCKED; M2–M4 implementáció nem történt.

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3: **BLOCKED**, a biztonságos előkészítés elkészült, de valódi PostgreSQL-kapu hiányzik. M2, M3 és M4: **TODO**, a sorrend nem lett megkerülve.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

## 0.2.7 — M1.3 PostgreSQL/Alembic előkészítés

- Elkészült a `DATABASE_URL`-alapú adatbázis-konfiguráció, az Alembic `0001_initial_foods` revízió, a külön dev/test/prod példakonfiguráció és a Railway pre-deploy/healthcheck előkészítés.
- Elkészült a biztonságos SQLite cache-import eszköz read-only forrással, konzisztens backup API-val, dry-run móddal, canonical rekord- és nutrient-egyezéssel, idempotenciával, konfliktusvédelemmel és rollbackkel.
- Az M1.3 offline ellenőrzései és 46 backend-tesztje sikeresek, de a valódi PostgreSQL-integrációs teszt a hiányzó helyi PostgreSQL-környezet miatt skipped; M1.3 ezért `BLOCKED`, M2–M4 nem indult el.

## 0.2.6 — M1.2.3 USDA és Open Food Facts integráció stabilizálása

- A USDA `/foods/search` kérés POST JSON formára váltott tömbös `dataType` mezővel; ezzel megszűnt az ismételt `dataType` query-paraméterekből eredő HTTP 400.
- Az OFF provider normalizált keresési kifejezést használ, a 429/5xx, timeout és hálózati hibákat korlátozott exponenciális retry kezeli; 400-as és hitelesítési hibák nem ismétlődnek automatikusan.
- Bevezetésre került a kulcsmentes provider-diagnosztika státusszal, hibatípussal, HTTP metódussal, kereséssel, válaszidővel és retry állapottal; a provider-hibák izoláltak, a cache- és friss-találatok külön számlálódnak.
- Az élő hat-query USDA/OFF combined smoke sikeres lett; a backend 40 tesztje, a frontend typecheck/lint/unit tesztje és production buildje sikeres.
- Az M1.2 mérföldkő lezárva; a külső szolgáltatók időszakos 503 válaszai diagnosztizált, retry-vel kezelt korlátozásként maradnak dokumentálva.

## 0.2.5 — M1.2 végső integrációs ellenőrzés

- A backend kulcsérték kiírása nélkül igazolta az USDA konfigurált állapotát.
- Az egyszerű alias-rangsor most kezeli a vesszővel tagolt USDA-neveket (`Banana, raw`, `Bananas, raw`), és nem emeli a banánpaprikát sima banán-találatként.
- Élő combined smoke készült a banán, banánpaprika, alma, rizs, csirkemell és Activia banán keresésekre; a cache és a provider-hiba fallback működött.
- A USDA és OFF külső végpontok egyes kéréseknél intermittáló hibát adtak, ezért az M1.2 mérföldkő továbbra is `IN PROGRESS`.

## 0.2.4 — M1.2.2 USDA diagnosztika és találatjavítás

- Feltártuk, hogy a banánnál látott eltérő CH-értékek különböző USDA FDC rekordokból és adattípusokból származnak; a 1005/1079 alapú számítás Foundation, SR Legacy és FNDDS rekordokon determinisztikus maradt.
- Javítva lett a túl tág magyar névszabály, amely a banánpaprikát `Banán, nyers` néven jelenítette meg. A forrásnév alapján megmaradnak az élelmiszerek közötti különbségek, az eredeti angol név másodlagosan látható.
- A USDA cache payload most megőrzi a mapping verzióját, adattípusát, kategóriáját, tápanyagazonosítóit és nyers értékeit; ellentmondó rostadatnál nincs becslés.
- Bevezetésre került a célzott `USDA_MAPPING_VERSION = 4` cache-migráció, amely rekordtörlés nélkül javítja a korábban eltárolt megjelenítési metaadatot.
- Új offline regressziós tesztek ellenőrzik az adattípusokat, hiányzó/gyanús tápanyagokat, neveket, FDC-deduplikációt és cache-ből visszatöltött találatokat.

## 0.2.3 — M1.2.1 magyar kereső és kategorizálás

- Az egyszerű alapanyag- és összetett termékkeresések külön, determinisztikus rangsorolási szabályt kapnak.
- A pontos, nyers alapanyag-találatok megelőzik a feldolgozott termékeket egyszerű keresésnél; összetett keresésnél minden keresési szó relevanciája számít.
- A magyar aliaslista kibővült a gyakori gyümölcsökkel, húsokkal, tejtermékekkel, gabonákkal és zöldségekkel; a kisbetű, nagybetű és ékezet normalizálása megmaradt.
- Az USDA megjelenítési név és eredeti forrásnév külön mezőben marad, az OFF és USDA találatok konzervatív kategóriát kapnak.
- A keresési API és a meglévő CH-adatmezők változatlanok; a frontend a kategória magyar címkéjét jeleníti meg.

## 0.2.2 — M1.2 integrációs diagnosztika

- A USDA config az aktuális working directorytól függetlenül a `backend/.env` fájlt tölti be.
- Combined keresésnél a cache/OFF találat nem akadályozza meg az USDA provider hívását.
- USDA és aggregátor diagnosztikai count logok, alias-query naplózás és korlátozott details fallback került be.
- M1.2 státusza IN PROGRESS marad a valódi kulcsos combined smoke sikeréig.

## 0.2.1 — M1.2 USDA FoodData Central & generikus keresés

- Elkészült a config-alapú USDA FoodData Central provider és a `backend/.env.example` API-key setup.
- A USDA total carbohydrate és dietary fiber értékekből fiber-aware `available_carbs_100g` készül; hiányzó rost nem lesz automatikusan nulla.
- Elkészült a kis magyar alias réteg és a generikus/márkás találatok egyszerű, determinisztikus rankingje.
- A keresési aggregator az SQLite cache-t, USDA-t és OFF-et egy válaszban kezeli, provider-hibák izolálásával.
- A frontend egységes listában jelzi az alapélelmiszereket; a meglévő add flow és API szerződés megmaradt.

## 0.2.0 — M1.1 Food domain & valódi keresés

- Elkészült a belső Food/FoodCandidate domain és a provider abstraction.
- Integrálva lett az Open Food Facts: magyar névpreferencia, korlátozott mezők, CHill User-Agent és determinisztikus CH mapping.
- Elkészült a SQLite cache source/source_id deduplikációval és minimális forrásmetaadattal.
- Elkészült a `/api/foods/search` és `/api/foods/barcode/{barcode}` endpoint.
- A frontend mock keresése valódi, debounce-olt backend keresésre váltott loading, no-results, hiba és CH nélküli állapotokkal.

## 0.1.2 — M0.2 Final UI Cleanup & M0 Closure

- Kikerült a motivációs filler kártya és a felesleges dekoratív eyebrow szövegezés.
- A daily hero sorrendje letisztult: aktuális CH, maradék CH, napi keret, progress.
- A CHill wordmark és a CH monogram app ikon/favikon finomítva és ellenőrizve lett.
- A mobil-first app shell desktopon finom, középre zárt felületkeretet kapott; külön dashboard nem készült.
- Az étkezési lista és a bottom navigation spacingje, elválasztói és állapotai változatlan flow mellett tisztultak.

## 0.1.1 — M0.1 Visual Identity & UI Polish

- A termék user-facing neve CHill.
- Elkészült a Fresh Premium wordmark és a központosított design token készlet.
- Egyszerűsödött a daily hero: a redundáns progress ring és százalék kijelzés kikerült.
- Az étel- és étkezéslisták emoji helyett egységes line icon vizuált használnak.
- Finomodtak a pressed/focus/slide-in/count/progress micro-interactionök.

## 0.1.0 — M0

- Az M0 alapcsomagban elkészült a mobil-first napi áttekintő és mock étkezési lista.
- Elkészült a kétlépéses ételkeresés és gramm alapú CH-számítás.
- Hozzáadás után frissül a napi összesítő és visszajelzés jelenik meg.
- Elkészült a light/dark téma, bottom navigation és PWA infrastruktúra.
- Elkészült a minimális FastAPI health endpoint és projektmemória.



## 0.5.0 — Vendég mód és felhasználói rendszer — 2026-09-25

- IndexedDB vendég napló/cél, háromnapos látható ablak, automatikus törlés nélkül.
- Regisztráció, email-megerősítés/reset terv, scrypt jelszóhash, session, CSRF, rate limit és user-owned profile.
- Hitelesített meal/goal API, explicit idempotens vendégimport CH-újraszámolással, snapshot/célverzió-megőrzéssel és rollbackkel.
- Az automatizált M5-kapuk sikeresek; a módosított UI 360/390 px-es böngészős QA-ja a környezetben elérhető böngészővezérlés hiánya miatt nyitott.
- A vendég IndexedDB nézet és célkezelés már nem várja meg az auth-lekérdezést; a regisztráció csak későbbi, opcionális fiókos váltás.
- Email-delivery adapter és Railway deploy nincs végrehajtva.
