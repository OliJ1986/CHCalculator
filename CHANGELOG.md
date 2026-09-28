# Changelog

## Unreleased — M8–M11 saját katalógus, tervezés és bevásárlólista — 2026-09-25

- Profilhoz kötött saját étel CRUD és kedvenc kezelés készült szerveroldali CH-validációval; vendég módban az adatok IndexedDB-ben maradnak.
- A receptek hozzávaló-snapshotból számítják az össz- és adagonkénti CH-t, a recept étkezésként naplózható gramm vagy adag szerint.
- Napi étkezéstervező és bevásárlólista API készült, a tervből generált tételek csak azonos név és kompatibilis egység esetén aggregálódnak.
- Az Alembic `0006`–`0009` migrációk és a lokális SQLite additive kompatibilitás elkészült; dev/test PostgreSQL head ellenőrizve.
- A vendég IndexedDB 2-es verziója additive módon tárol saját ételeket, recepteket, terveket és bevásárlótételeket; a korábbi napló/cél adatok megmaradnak.
- A vendég saját ételek regisztráció után explicit megerősítéssel, idempotens szerveroldali importtal átvihetők; a tervezett étkezés külön művelettel kerülhet a naplóba.
- Ellenőrzés: izolált `chill_test` PostgreSQL-környezettel teljes backend `84 passed`, frontend 9 unit teszt, typecheck és build sikeres. A lint csak a korábbi React effect figyelmeztetéseit jelzi; browseres mobil QA nem futott böngésző hiányában.
- A vendégimport most már a recepteket, terveket és bevásárlótételeket is idempotensen átviszi; az IndexedDB törlése csak sikeres import-válasz után történik.

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

### M12 mobil UX 2.0
- Ötelemű mobil navigáció, központi gyors hozzáadás, tömörebb napi/profil nézet és napjelzés készült. A böngészős mobil QA továbbra is nyitott.

### M13 receptek 2.0
- Teljes mobil receptszerkesztő, többforrású hozzávalók, determinisztikus CH, főtt tömeg alapú opcionális CH/100 g, snapshot és naplózás készült.

### M14 planner 2.0
- Heti tervnézet, napmozgatás/másolás, tervezett-tényleges CH összegzés és idempotens heti bevásárlólista-frissítés készült.

- A gyors hozzáadás kedvenc saját ételeket és recepteket is kínál.

## 2026-09-26 — Mobil QA hibajavítás

- Javítva a frontend App.tsx hibásan dekódolt magyar szövege; az érintett feliratok most valódi Unicode karaktereket tartalmaznak.
- Reszponzív tördelés került a kis képernyős kártyafejécekhez, így a bevásárlólista és a heti tervező műveleti gombjai nem lógnak ki.
- A service worker cache-verziója `chill-m14-v1` lett, a régi cache-ek aktiváláskor törlődnek, és az API-válaszok továbbra sem cache-elődnek.
- Új encoding- és PWA-regressziótesztek készültek; Chromium/WebKit mobil QA sikeres 360×800 és 390×844 méreten.

## Unreleased - M15-M18 CHill Camera (2026-09-26)

### Nutrition OCR 2.0 és vonalkódos hibakezelés

- A helyi OCR most magyar és angol tápértéksorokat, külön tápanyagmezőket és 100 g/100 ml/adag alapot kezel.
- A képkivágás, nagyítás és kontrasztjavítás mobilon állítható; OCR-hiba esetén minden adat kézzel javítható és ellenőrzött 100 g-os CH-val saját étel menthető.
- Az OFF 404 ismeretlen termék üres találatként jelenik meg. A frontend a 401/403, 429, 5xx és hálózati hibákat eltérő, érthető üzenettel kezeli.
- Magyar majonéz fixture, frontend API/parser regressziók és Chromium/WebKit mobil OCR tesztek kerültek be.

- Added an integrated Camera panel with barcode, nutrition-label and food-photo modes.
- Added ZXing EAN scanning through the existing OFF barcode endpoint, with manual and image-upload fallbacks.
- Added local Tesseract.js nutrition parsing with explicit 100 g/100 ml/serving handling and manual review before custom-food save.
- Added a disabled-by-default, rate-limited Gemini adapter and a deterministic mock provider; AI never supplies CH values.

### M15-M18 camera regression fix - 2026-09-26

- Fixed the barcode start lifecycle: the video ref exists before the user starts scanning, permission and device errors are visible, and all streams are stopped on close, retry, switch, capture and unmount.
- Fixed shared camera stream attachment and stale facing-mode switching for Safari-style media lifecycles.
- Added local multi-pass barcode image preprocessing with EAN-8/EAN-13 checksum validation and a manual-entry fallback. Images never leave the device.
- Added deterministic Chromium/WebKit camera regression coverage at 360, 375 and 390 px, including denial/retry, cleanup, valid EAN image recognition and invalid manual input.


### Nutrition OCR 2.1 - touch crop (2026-09-27)

- Replaced the primary four-slider crop UI with a full-image, touch-friendly selection rectangle with move and four-corner resize handles, dimmed outside area, bounds/minimum-size enforcement and a full-image reset.
- Kept the range controls as a collapsed keyboard-accessibility fallback and retained the original local source image until the next capture or close.
- Unified normalized selection-to-source-pixel mapping for the canvas/OCR path; nutrient interpretation, local OCR and save rules are unchanged.
- Added portrait/landscape and selected-pixel regression coverage. Chromium and WebKit each pass 12 tests at 360x800, 375x812 and 390x844; frontend unit count is now 25.

## Unreleased - Gemini 3.8 Flash adapter - 2026-09-27

- The server-side Gemini food-vision adapter now targets `gemini-3.8-flash` by default, uses low Gemini 3 thinking, and has a configurable 1024-token response budget.
- Prompt and parser safeguards prevent near-duplicate food suggestions and mark uncertain ingredients consistently without inventing nutrient values.
- Added deterministic mock regressions and one opt-in live smoke test. The live test was not executed because the local environment loaded no non-empty Gemini key; no secret was printed or committed.

## 2026-09-27 - M19 Gemini Food Vision stabilisation

- Added a durable `vision_usage` PostgreSQL counter (Alembic `0010`) for global, user and guest minute/daily limits with transactional row locking.
- Hardened the food-vision endpoint with bounded image reads, structured safe error codes, provider failure classification, retry guidance and secret-free diagnostics.
- Made file selection independent from camera permission, retained the source image for retry, blocked parallel analysis, and added explicit empty/selected/processing/error/success UI states.
- Kept Gemini 3.8 Flash as the default with configurable 1024-token output, parser-side duplicate removal and explicit uncertain ingredient markers. Nutrient estimation remains forbidden.
- Added API, quota, provider and mobile regression coverage. Backend: 95 passed/6 skipped; frontend: 27 unit tests; Playwright: 36 Chromium/WebKit tests passed at the three mobile widths.
- The single permitted live Gemini smoke was attempted but could not establish TLS trust in the local Windows environment (`CERTIFICATE_VERIFY_FAILED`); no secret or provider response was recorded and the live gate remains open.
## 2026-09-27 - M19 pre-deploy verification

- Reproduced the live Gemini failure as a local CA trust-source mismatch: certifi verification fails, while the Windows ROOT trust set verifies TLS 1.3. TLS verification remains enabled and no adapter bypass was added.
- Applied Alembic `0010_vision_usage` only to the dedicated PostgreSQL test database and added a concurrency regression proving the global daily budget is atomic (`2 passed`).
- Full backend verification against the isolated test database: `101 passed, 1 skipped, 2 warnings`.
- The live provider gate remains open until the local CA chain is configured; no production database, Railway deployment or push was used.

## 2026-09-27 - M19 final Gemini integration gate

- Added secure `truststore`-backed system certificate validation to the Gemini httpx client; hostname and certificate verification remain required.
- The single live Gemini smoke passed with a valid structured response and parser validation. No raw response or secret was recorded, and nutrient estimation remains prohibited by the prompt and response contract.
- Full backend regression with the isolated PostgreSQL test database: `102 passed, 1 skipped, 2 warnings`; `pip check` is clean.
- Added the Railway M19 staging deployment checklist. No push or deployment was performed.

## 2026-09-27 - M19 Hungarian food-vision results

- Gemini now requests Hungarian food names and ingredient values without changing the established JSON field names or allowing nutrient estimates.
- Frontend uncertainty is structured locally, shown in natural Hungarian, and no exact confidence percentage or raw `uncertain:` marker is rendered.
- Added a local editable confirmation step for the suggested food name and ingredient text; confirming reuses the existing search flow and does not issue another Gemini request.
- Added API, prompt and Chromium/WebKit mobile regressions for the new mapping and confirmation flow.
- The complete camera suite passes in Chromium and WebKit at 360, 375 and 390 px (`36 passed`).


## Unreleased - M20 CHill Chef MVP - 2026-09-27

- Added an editable Chef review workflow after food-vision confirmation. Ingredient names, uncertainty, removal, replacement and additions stay local until the user confirms each ingredient.
- Reused existing custom-food/IndexedDB, OFF and USDA search results per ingredient and kept source plus verified CH visible. Missing CH cannot be silently treated as zero; manual foods require an explicit 100 g CH value.
- Added deterministic gram-based subtotal/total validation and recipe, diary and planner integration for authenticated and guest storage.
- Added Chef calculation unit coverage and a Chromium mobile Vision-to-recipe/diary regression at 360, 375 and 390 px. Full WebKit/Chromium M20 gate and M20.5 suggestions remain open.

## 2026-09-27 - M20 Chef MVP workflow

- Added an Alapanyag fotó mode using the existing Vision endpoint and quota boundary; the user reviews and confirms ingredient candidates locally.
- Added up to three matching existing recipe suggestions from the current catalog/guest recipe store, without a new AI request or nutrient inference.
- Added the full mobile Chef regression path. Final Playwright Chromium/WebKit coverage is 48/48 at 360, 375 and 390 px; frontend unit/typecheck/build gates pass.
- Backend behavior was unchanged; its regression gate remains open until pytest is available in the local Python environment.

## 2026-09-27 - M21 CHill Chef fridge recognition and recipe generation

- Added a mobile-first CHill Chef fridge workflow with camera/gallery selection, up to four local photos, local downscaling, replace/remove actions and an explicit recognition button.
- Added batched `POST /api/vision/fridge` recognition through the existing Gemini, TLS, error and PostgreSQL quota boundaries. One user action makes one provider request and no nutrient or quantity estimate is accepted.
- Added a conservative editable inventory review with uncertainty markers, exact-name deduplication, explicit merge/split controls and per-item confirmation.
- Added explicit `POST /api/chef/recipes/generate` generation for up to three structured Hungarian recipe ideas. Recipe responses are validated and contain no CH, calorie, gram or other nutrient estimates.
- Reused the existing Chef catalog matching, deterministic CH calculation, recipe save, diary/planner and shopping-list flows. Missing shopping entries retain an unknown quantity.
- Added API/provider/Vitest and Chromium/WebKit mobile regressions. Backend regression is `106 passed, 1 skipped, 2 warnings`; browser regression is `54 passed`.
- No database migration, production database change, Railway deployment or push was performed.


## 2026-09-28 – M22 Mobile Product Polish

- Mobilon kompaktabb, egymás után ellenőrizhető Chef-összetevősorok, draft-megőrzés és befejezési állapot készült.
- Javult a CH-bevitel (üres érték és explicit nulla), a Chef ismételt mentése, a célzott retry és a lekérdezés-frissítés.
- A hűtőfotó-flow képcserét, képszámlálót, kézi leltár-folytatást és egyértelmű adatkezelési tájékoztatást kapott.
- A katalógus ételek és receptek nézetre vált, a Tervező naptári másolása és bevásárlólista-mennyisége pontosabb, a navigáció akadálymentesebb.
- A kamera mobilon teljes képernyős, safe-area-kompatibilis elrendezést használ; a lokális OCR/vonalkód útvonal változatlan.
- QA: backend 100 passed/7 skipped; frontend unit 34 passed; Playwright Chromium/WebKit 56 passed; typecheck/build sikeres.

## 2026-09-28 – M22.1 mobil kamera-regressziók

- A teljes képernyős kameranézet külön portalba került, ezért mobilon nem függ a felviteli sheet transzformációjától vagy túlcsordulásától.
- A vonalkódolvasó ismeretlen termék vagy lookup hiba után aktív marad és újrapróbálható; csak elfogadott találat vagy explicit bezárás állítja le.
- Az öt állandó kamerafül helyét egyszeri feladatválasztó vette át, az aktív nézet egyetlen fejlécet és feladatspecifikus műveleteket mutat.
- Egy hűtőfotó teljes szélességű, 2–4 fotó kéthasábos rácsot használ; a csere és törlés minden méreten a képen belül marad.
- A tápérték OCR jelzi és javításig blokkolja a fizikailag lehetetlen vagy ellentmondó értékeket anélkül, hogy azokat nullára vagy becsült értékre írná át.
- QA: backend 100 passed/7 skipped; frontend unit 36 passed; typecheck/lint/build sikeres; Playwright Chromium/WebKit 62 passed 360×667, 375×812 és 390×844 méreteken.
