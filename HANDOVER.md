# Handover — M4 célok és étkezési kategóriák lezárva

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**; M5 kódja és automatizált kapui elkészültek, de a böngészős UI-kapu miatt **IN PROGRESS**. A korábbi blokkolt állapot története megmarad, az új ellenőrzések külön vannak rögzítve.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

## Jelenlegi állapot

Az M0, M0.1, M0.2, M1.1 és M1.2 lezárult. Az M1.2.3 stabilizálása elkészült, a konfiguráció betöltése kulcsérték megjelenítése nélkül igazolt, és a combined USDA/OFF integráció élő ellenőrzése sikeres: működő React/Vite frontend, CHill vizuális identitás, PWA build-infrastruktúra, Food domain, Open Food Facts + USDA provider, SQLite cache és FastAPI backend.

M0 státusz: DONE. M1.1 státusz: DONE. M1.2 státusz: DONE. M1.3 státusz: DONE. M2 státusz: DONE. M3 státusz: DONE. M4 státusz: **DONE**.

## Elkészült funkciók

- „Ma” képernyő: 84 / 160 g mock állapot, progress bar és étkezési lista.
- „Étkezés hozzáadása” bottom sheet: debounce-olt valódi backend keresés, étel kiválasztása, gramm input, +/- és gyors mennyiségek.
- Determinisztikus `amount × CH_100g / 100` számítás; 55 g alma = 6,27 g, UI-ban 6,3 g.
- Frontend state-ben frissülő összesítő és toast.
- Mobil bottom navigation, placeholder oldalak, light/dark theme.
- `/api/health` FastAPI endpoint, CORS és SQLAlchemy/SQLite konfiguráció.
- Fresh Premium tokenek, CHill wordmark és a daily hero egyszerűsített hierarchiája.
- Emoji helyett konzisztens line iconok az étel- és étkezéslistákban.
- CSS pressed/focus/slide-in/count/progress micro-interactionök.
- A motivációs filler kártya eltávolítva, a dekoratív uppercase eyebrow címkék csökkentve.
- A hero sorrendje aktuális CH → maradék CH → napi keret → progress.
- Finom desktop surface framing, külön dashboard-struktúra nélkül.
- CH monogram konzisztens a wordmarkkal, a manifest/title/meta/favicon/app icon branding ellenőrizve.
- Belső `FoodCandidate` és `Food` domain modell a `available_carbs_100g` központi CH mezővel.
- `FoodProvider` abstraction és `OpenFoodFactsProvider`: OFF keresés, v3 barcode lookup, mezőkorlátozás és CHill User-Agent.
- Cache-first SQLite keresés source/source_id deduplikációval és minimális `source_payload` forrásmetaadattal.
- `/api/foods/search?q=` és `/api/foods/barcode/{barcode}` backend endpointok.
- Frontend API adapter, 300 ms debounce, minimum két karakter, loading/no-result/error és CH nélküli találat állapotok.
- `USDAProvider` configból olvasott `USDA_API_KEY`-jel; API key nélkül logolt, graceful unavailable állapot.
- Magyar aliasok: alma, banán, körte, narancs, citrom, burgonya/krumpli, rizs, tészta, csirkemell, sertéshús, marhahús, tojás, tej, sajt, vaj, kenyér, zabpehely, cukor, porcukor, liszt, paradicsom, paprika, uborka és sárgarépa; a gyakori USDA-nevekhez kézi magyar megjelenítési címkék tartoznak.
- USDA Foundation/SR Legacy/FNDDS rekordok és branded OFF rekordok egyaránt a közös kategória-, név-, token- és márkarelevancia-rangsoron mennek át; a source önmagában nem ad előnyt.
- USDA és OFF provider-hibák izoláltak; cache-es találatok visszaadhatók külső kieséskor.
- A config az `backend/.env` fájlt a repo aktuális working directoryjától függetlenül tölti be; csak a konfigurációs állapot (`USDA configured: true/false`) diagnosztizálható, a kulcs értéke nem kerül logba.
- Combined keresésnél a cache/OFF találat nem rövidíti le az USDA provider hívását; a provider- és aggregátor-countok INFO logban követhetők.
- USDA search diagnosztika raw/mapped/invalid CH countot ad, a részletek fallbackje legfeljebb a top 3 találatra korlátozott.

## Futtatás

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

```powershell
cd backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

## Ellenőrzések

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build

cd ..\backend
..\.venv\Scripts\python.exe -m pytest
```


## Korábbi validáció

Frissített validáció: frontend `typecheck`, `lint`, 4 unit teszt és production build sikeres; backend 22 teszt sikeres. A korábbi konfiguráció-ellenőrzés szerint a `backend/.env` létezett, de az `USDA_API_KEY` üres volt, ezért akkor a valódi kulcsos combined smoke nem volt futtatható. A DEMO_KEY diagnosztikai hívások közül a banana/rice/powdered sugar működött és a 1005/1079 nutrient ID-k jelen voltak; az apple kérés DEMO_KEY korlátozás miatt 400/429 választ adott.

## Korlátozások és technikai tartozás

Az induló napi étkezési lista továbbra is mock UI-állapot; a keresési ételek már OFF-ból érkeznek és SQLite cache-be kerülnek. Meal/log perzisztencia nincs, a teljes offline adatkezelés későbbi feladat. A vizuális browser QA környezetfüggő, a funkcionális ellenőrzések automatizáltan sikeresek.

## Következő logikus feladat

Az M1.2 lezárult; az aktualizált terv következő feladata az M1.3 PostgreSQL/Alembic/cache-migráció és Railway-előkészítés, utána az M2 CH kalkulátor. Az időszakos külső 503 válaszok a retry- és diagnosztikai szabályok szerint kezelendők, de a lezáró élő smoke-ban nem maradt végső provider-hiba.

## M1.2.1 lezárt fejlesztés

- A keresés egyszerű alapanyag- és összetett termék-szándékot különböztet meg, majd név-, alias-, token-, kategória- és márkarelevancia alapján pontoz. Azonos pontszámnál név, eredeti név, márka, source és source_id ad stabil sorrendet.
- A magyar aliaslista a gyakori gyümölcsökkel, húsokkal, tejtermékekkel, gabonákkal és zöldségekkel bővült. A normalizálás kis- és nagybetűt, ékezetet és többlet whitespace-t kezel.
- Az USDA és OFF mapper megőrzi az eredeti forrásnevet, és `ingredient`, `processed`, `packaged`, `other` kategóriát ad. Bizonytalan adatoknál `other` a konzervatív alapérték.
- A meglévő SQLite cache az új oszlopokat induláskor additív módon megkapja; a provider-hívások, a cache-first flow és a CH-számítás szabálya változatlan maradt.
- Az automatikus ellenőrzések sikeresek: backend 27 teszt, frontend typecheck, lint, 4 unit teszt és production build.
- Az M1.2.1/M1.2.2 fejlesztési körben élő USDA/OFF combined smoke még nem futott; a kulcs értékét akkor sem olvastam ki és nem naplóztam.

## M1.2.2 — USDA adatok és találatok ellenőrzése

- A banán-találatok vizsgálata alapján a CH-számítás nem volt a probléma oka. A különböző USDA FDC rekordok eltérő élelmiszereket és adatforrásokat jelölnek: FDC 2709224 (Survey/FNDDS) `22,71 - 1,70 = 21,01`, FDC 173944 (SR Legacy) `22,8 - 2,6 = 20,2`, FDC 1105073 (Foundation) `20,1 - 1,7 = 18,4`, míg a két banánpaprika rekord (FDC 169394 és 2709802) `5,35 - 3,4 = 1,95` g elérhető szénhidrátot ad 100 grammonként.
- A tényleges hiba a túl tág `banana + raw` magyar névszabály volt: a `Pepper, banana, raw` és `Peppers, banana, raw` rekordok tévesen `Banán, nyers` néven jelentek meg. A fordítás most a forrásnév elejéhez és az élelmiszer típusához kötött; a banánpaprika `Paprika, banánpaprika, nyers`, a túlérett banán külön megkülönböztető nevet kap, az eredeti angol név pedig másodlagos szövegként látható.
- Az USDA payload megőrzi a FDC azonosítót, eredeti nevet, adattípust, kategóriát, a használt tápanyagazonosítókat (1005 total carbohydrate, 1079 dietary fiber) és a nyers értékeket. Érvénytelen vagy ellentmondó rostadatnál nincs becsült CH-érték.
- Azonos `(source, source_id)` rekord csak egyszer kerül a találatok közé; eltérő FDC azonosítók megmaradnak. A célzott cache-migráció `USDA_MAPPING_VERSION = 4` alapján csak a megjelenítési metaadatot frissíti, rekordot nem töröl és a korábban számított CH-t nem írja át.
- Regressziók készültek Foundation, SR Legacy és FNDDS adatokra, hiányzó/ellentmondó tápanyagokra, eredeti név szerinti megkülönböztetésre, FDC-deduplikációra, cache-migrációra és magyar címkékre.
- Az automatikus ellenőrzések sikeresek: backend 33 teszt, frontend typecheck, lint, 4 unit teszt és production build.
- Az M1.2.2 lezárásakor még nem volt használható kulcsos élő smoke; a későbbi végső integrációs ellenőrzés ezt külön dokumentálja.

## M1.2 végső integrációs ellenőrzés — korábbi, nyitott állapot

- A backend konfigurációja a kulcs értékének megjelenítése nélkül `USDA configured: True` állapotot adott.
- A helyes Unicode-bemenettel futtatott élő HTTP smoke mind a hat kért lekérdezésnél 200-as választ adott. A banán és banánpaprika eredmények releváns USDA rekordokkal, magyar névvel, eredeti angol névvel, CH-értékkel és `ingredient` kategóriával jelentek meg; az Activia banán OFF-találatként `processed` kategóriát kapott.
- A rangsor javítása után a vesszővel tagolt `Banana, raw` és `Bananas, raw` rekordok megelőzik a márkanévben szereplő banana-találatokat; a `Pepper, banana, raw` rekord továbbra is külön banánpaprikaként marad.
- A live lista az almánál főleg OFF termékeket, a rizsnél USDA `Rice ...` rekordokat, a csirkemellnél USDA különböző elkészítési állapotokat tartalmazott. Ezek ellenőrizhetők, de a szolgáltatói keresési rangsor adatfüggő, és nem minden esetben ad nyers alapanyag-találatot az első helyeken.
- Külön provider-diagnosztikában az USDA apple/chicken kérések és az OFF egyes lekérdezései intermittáló hibát adtak; egy státusz-mátrixban ugyanazok a USDA útvonalak részben 200, részben 400 választ adtak. Emiatt a külső combined integráció nem tekinthető stabilan sikeresnek.
- A cache-fallback sikeres: két hibát jelző provider mellett a cache 20 banán-találatot adott vissza, az első három a nyers USDA banánrekord volt.
- A cache-migráció ellenőrzése sikeres: 103 USDA-sor, mind `mapping_version: 4`, nincs elavult sor és nincs duplikált FDC-azonosító; a banánpaprika sorok megkülönböztető magyar névvel és változatlan CH-val maradtak meg.
- A teljes automatikus ellenőrzés sikeres: backend 34 teszt, frontend typecheck, lint, 4 unit teszt és production build.
- A korábbi ellenőrzési futás állapotában M1.2 `IN PROGRESS` maradt; ezt a következő M1.2.3 stabilizálási és élő smoke futás zárta le. Az API-kulcs értékét akkor sem olvastam ki, nem naplóztam és a `backend/.env` fájlt nem módosítottam.

## M1.2.3 — lezárt stabilizálás és átadási állapot

- A USDA HTTP 400 tényleges oka a `/foods/search` GET kérés ismételt `dataType` query-paraméterezése volt. A provider most POST JSON törzset használ tömbös `dataType` mezővel; a részletes FDC-lekérés GET maradt.
- Az OFF összetett keresés normalizált queryt használ. A 429/5xx, timeout és hálózati hibákra korlátozott exponenciális retry került a közös HTTP-rétegbe; 400-as és 401/403 hitelesítési hibák nem ismétlődnek változatlan kéréssel.
- A diagnosztikai bejegyzés forrást, request type-ot, metódust, queryt, státuszt, hibatípust, válaszidőt, próbálkozást és retry állapotot tartalmaz, URL vagy titkos paraméter nélkül. A FoodService külön cache-, friss USDA- és friss OFF-számlálót logol, és a provider-ek egymástól izoláltak.
- A helyes Unicode-bemenettel futtatott lezáró combined smoke mind a hat querynél 200-as választ adott: `banán` (20), `alma` (20), `rizs` (20), `csirkemell` (20), `banánpaprika` (2) és `Activia banán` (1). A friss számlálók, magyar/original nevek, CH-értékek, kategóriák és source/source_id deduplikáció ellenőrizve lettek; a lezáró futásban végső provider-hiba nem maradt.
- A külön provider smoke-ban az USDA mind a hat kérést sikeresen feldolgozta (a banánpaprikára 0 rekord), az OFF pedig a négy általános ételre és az Activia keresésre adott eredményt (a banánpaprikára 0 rekord). A combined aggregátor mindkét provider eredményeit és a cache-t együtt kezelte.
- Az időszakos OFF 503 válaszok több alkalommal retry-vel helyreálltak; külön `alma` újrateszt két egymást követő sikeres választ adott. Ez szolgáltatói átmeneti korlátozás, nem ismételt hibás kérés.
- A `USDA_MAPPING_VERSION = 4` cache-migráció továbbra is rekordtörlés nélkül érvényes; a lezáró futás után 123 USDA-sor, nincs elavult mapping és nincs duplikált FDC azonosító. Az API-kulcs csak konfigurált állapotként volt ellenőrizve, értéke nem került kiírásra vagy naplózásra, a `backend/.env` nem módosult.
- Végső regresszió: backend 40 teszt sikeres; frontend typecheck, lint, 4 unit teszt és production build sikeres.

## Új átadás — dokumentációfrissítés, 2026-09-24

Elkészült ebben a körben: a nyolc feltöltött MD összehangolt fejlesztési terve és az autonóm Codex-prompt. Alkalmazáskódot és adatbázist nem módosítottunk, új tesztet és migrációt nem futtattunk. Az M1.2.3 40 backend/4 frontend tesztje, hat-query smoke-ja és 123 USDA-cache sora kizárólag az előző lezárás eredménye.

Indulási sorrend:

1. Olvasd a nyolc MD-t és a jelenlegi repót; ellenőrizd az időközben keletkezett változtatásokat, ne írj felül újabb történetet.
2. Futtass alapellenőrzést, mérd fel az aktuális SQLite-sémát/adatokat és a PostgreSQL-környezetet. (A dokumentációs átadás pillanatában M1.3 még TODO volt.)
3. Készítsd el és igazold M1.3 összes kapuját, majd M2 → M3 → M4; tesztelt helyi commitokkal, folyamatos átadási jegyzettel.
4. Valódi Railway-deploy nincs engedélyezve ebben a scope-ban. A felhős hozzáférés hiánya nem akadálya az előkészítésnek; a helyi PostgreSQL-tesztek és valódi cache-import hiánya viszont nyitott M1.3 kapu.

Tervezési alapértékek: egy privát profil, Europe/Budapest időzóna rögzített helyi nappal; múltmegőrző nutrient-snapshot és hatálynapos cél; nincs kiosztott CH-keret. Ezek követelmények, nem meglévő funkciók. Részletes kapuk és kockázatok: TASKS.md, AGENTS.md, ARCHITECTURE.md.

Minden fejlesztési kör végén töltsd ki: aktuális mérföldkő/státusz; megvalósított változás; tényleges tesztparancsok/eredmények; importleltár és eltérések titokmentesen; commit hash; nyitott ellenőrzések; következő konkrét lépés. Ha elakadtál, pontosan mi hiányzik, és mi készült el ettől függetlenül.

## Történeti átadás — M1.3 előkészítve, PostgreSQL-kapu blokkolva

- Elkészült a `DATABASE_URL`-alapú dev/test/prod konfiguráció. Prod környezetben hiányzó URL hibát ad; PostgreSQL esetén az alkalmazásindítás nem futtat `create_all` vagy ad hoc DDL-t.
- Elkészült az Alembic `0001_initial_foods` alaprevízió, a `backend/.env.example`, `.env.test.example`, `.env.prod.example` példakonfiguráció, valamint a Railway pre-deploy migráció és healthcheck előkészítése. Valós Railway-szolgáltatás, prod DB vagy deploy nem történt.
- Elkészült a `python -m app.tools.cache_import` eszköz. A forrás read-only; backup API, integritás- és SHA-256/canonical digest ellenőrzés, default dry-run, explicit dev/test cél, teljes rekord/nutrient/JSON/NULL/0 egyezés, idempotencia és konfliktusos tranzakciós rollback működik.
- A tényleges `backend/chill.db` leltára: egy `foods` tábla, 341 rekord, 123 USDA-rekord, `mapping_version=4`. A `backend/backups/chill.db.pre-m1.3-20260924.sqlite` backup canonical rekord-digestje egyezik a forrással; eredeti SQLite és backup megmaradt, egyik sem kerül Gitbe.
- Ellenőrzések: offline Alembic SQL-generálás sikeres; backend `46 passed, 1 skipped, 1 warning`; frontend typecheck, lint, 4 unit teszt és production build sikeres. A skipped teszt a valódi PostgreSQL-integráció.
- A tényleges 341 rekordos SQLite-forrás teljes dry-run + write importja izolált SQLite-surrogate célon 341/341 rekorddal, azonos digesttel és visszaolvasással sikeres lett; ez az adatút ellenőrzése, nem PostgreSQL-kapunyitás.
- Blokkoló ok: nincs telepített/futó PostgreSQL-szerver, Docker, `psql` vagy `CHILL_TEST_DATABASE_URL`. Emiatt nem bizonyított a valódi Alembic upgrade, PostgreSQL CRUD/upsert, cache-import, teljes rollback és visszaolvasási egyezés. M1.3 nem DONE, M2–M4 nem kezdődött el.
- Git-korlát: a repó `main` ága commit nélküli, minden korábbi projektfájl untracked; ezért nem készült olyan commit, amely a felhasználói előzményt tévesen saját változtatásként rögzítené. A munkafa módosításai elkülöníthetők, de biztonságos saját-only commit a hiányzó baseline nélkül nem bizonyítható.
- Dokumentációs eltérés: az IDE-ben megnyitott `ELLENORZES.md` és `CSOMAG_UTMUTATO.md` fájlok a repó gyökerében nem voltak jelen; a ténylegesen elérhető projekt-MD-ket, köztük az `AGENTS.md`, `PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `TASKS.md`, `HANDOVER.md`, `CHANGELOG.md`, `README.md` és `CODEX_PROMPT.md` fájlokat elolvastam.
- Következő konkrét lépés: hozz létre egy kizárólagos `chill_test` PostgreSQL adatbázist és állítsd be a `CHILL_TEST_DATABASE_URL` értéket; ezután futtasd a PostgreSQL integrációt, a teljes importkaput és csak siker esetén folytasd M2-vel.

## 2026-09-25 — PostgreSQL-kapu újraellenőrzése

- A `postgresql-x64-18` Windows-szolgáltatás fut, és a `127.0.0.1:5432` TCP-port elérhető.
- A `backend/.env` kulcslistája csak az USDA-konfigurációt tartalmazza; `DATABASE_URL` és `CHILL_TEST_DATABASE_URL` nincs beállítva. Az értékeket és az USDA-kulcsot nem olvastam ki és nem naplóztam.
- Jelszó nélküli, helyi kapcsolati próba mind a `chill_dev`, mind a `chill_test` adatbázishoz `OperationalError` eredménnyel meghiúsult. Ez hitelesítési/configurációs akadály; Alembicet, valódi PostgreSQL CRUD-ot és importot emiatt nem futtattam.
- M1.3 továbbra is blokkolt; M2–M4 nem indítható el, amíg a PostgreSQL-integrációs kapu nincs bizonyítva.
- Minimális felhasználói lépés: a helyi, nem commitolandó `backend/.env` fájlban állítsd be a `DATABASE_URL` értékét a `chill_dev`, a `CHILL_TEST_DATABASE_URL` értékét a `chill_test` adatbázisra (a jelszó maradjon csak helyben). Ezután újra futtatható a kapcsolat-, migráció-, import- és regressziós kapu.

## 2026-09-25 — M1.3 lezárva

- A `postgresql-x64-18` szolgáltatás és a 5432-es port ellenőrzése után a konfigurált `DATABASE_URL` a `chill_dev`, a `CHILL_TEST_DATABASE_URL` a `chill_test` adatbázishoz csatlakozott. A jelszó és a teljes URL nem került kiírásra.
- Mindkét adatbázison az Alembic `upgrade head` első és ismételt futása sikeres. A PostgreSQL-sémát az Alembic kezeli; az alkalmazás nem futtat induláskor `create_all`-t PostgreSQL-en.
- A `chill_dev` adatbázisba a `backend/chill.db` 341 rekordja került be. A forrás- és backup-digest `a9fdff4847abe380cbeecc7664107a5e784aa5f6a0e2288e6d056c1687596d2c`, a célban 341 rekord van (123 USDA, 218 Open Food Facts), a teljes mező- és nutrient-egyezés igazolt. A forrás SQLite és backup változatlan.
- Az import első próbája timezone-eltérés miatt helyesen rollbackelt. A javítás UTC-aware beszúrást és UTC-normalizált összehasonlítást használ; ezután az import 341/341 rekorddal, majd második futáskor 341 azonos és 0 új rekorddal sikeres.
- `chill_test` alatt valódi ORM CRUD, source/source_id egyediség, import dry-run, konfliktusfelismerés és tranzakciós rollback sikeres; a fixture-takarítás után a tesztadatbázis üres maradt.
- A teljes backend regresszió `48 passed, 2 warnings`; a frontend typecheck, lint, 4 unit teszt és production build sikeres. A két warning meglévő Starlette/httpx és Alembic konfigurációs deprecation figyelmeztetés.
- Kódmódosítások: `backend/app/tools/cache_import.py` (UTC-időbélyeg/import-összehasonlítás), `backend/alembic/env.py` (loggerek megőrzése), `backend/tests/test_cache_import.py` (timezone-regresszió), valamint a státusz- és átadási dokumentációk. A M1.3 saját commitja a dokumentáció frissítése és ellenőrzés után készül.
- M1.3 státusz: **DONE**. M2 következő lépése a TASKS.md szerinti determinisztikus CH-kalkulátor; M3 és M4 csak a sorrendben követi.

## 2026-09-25 — M2 lezárva

- Elkészült a `backend/app/domain/carbs.py` validált, determinisztikus CH-számítása és a `POST /api/carbs/calculate` endpoint. A backend 0-nál nagyobb, véges, legfeljebb 100 000 g mennyiséget és 0–100 g/100 g közötti véges CH-t fogad el; hiányzó CH és hibás mennyiség 422.
- A frontend `src/lib/carbs.ts` ugyanazokat a numerikus korlátokat használja, a `12,5` és `12.5` formátumot egyformán kezeli, a valid 0 CH-t megtartja, a hibás inputot nem menti. A hozzáadási UI gyorsgombjai és +/- vezérlői ugyanazt a számítási függvényt használják.
- M2 mobil UI: 390×844 és 360×800 viewporton keresés → kiválasztás → mennyiség → eredmény működött; `12,5` g banánnál 2,6 g CH látszott, 0 g-nál hiba és tiltott mentés jelent meg. A 360 px nézet `scrollWidth == clientWidth`.
- Ellenőrzések: backend `62 passed, 2 warnings`; frontend typecheck, lint, `7 passed` unit teszt és production build sikeres. A warningok a korábbi Starlette/httpx és Alembic deprecation jelzések.
- M2 státusz: **DONE**. M3 következő lépése a TASKS.md szerinti PostgreSQL-alapú tartós étkezési napló és nutrient-snapshot; a prototípus lista továbbra sem tartós adat.

## M3 átadás — lezárva 2026-09-25

Az M3 implementációja a `0002_meal_log_snapshot` Alembic-migrációval, a `profiles`/`meal_entries` modellekkel, a szerveroldali snapshot- és idempotencia-service-szel, valamint a `/api/meals` létrehozás/listázás/módosítás/törlés végpontokkal készült el. A napló UTC időpontot, rögzített helyi napot és IANA-zónát tárol; mennyiségmódosítás a régi snapshotból számol, explicit ételcsere új snapshotot készít. A frontend már nem használ mock listát vagy fix napi célt: a valódi szerverlistát, üres/hiba állapotot, szerkesztést és megerősített törlést mutatja.

Ellenőrzés: `chill_test` valódi PostgreSQL-en az API CRUD, idempotencia, snapshot-megőrzés és napváltás sikeres; teljes backend `66 passed, 2 warnings`. Frontend `typecheck`, `lint`, `7` unit teszt és production build sikeres. Böngészős ellenőrzés 390 és 360 px-en, add/edit/delete flow-val és vízszintes túlcsordulás nélkül sikeres. A korábbi M1.2/M1.3/M2 történetet nem írtam át.

Korlát: az M3 profilja szándékosan egy szerveroldali `default-profile`; auth, többfelhasználós hozzáférés és teljes offline szinkron nem része ennek a scope-nak. A következő lépés az M4 felhasználói célok, hatálynapok és étkezési kategóriák megvalósítása.


## M4 átadás — lezárva 2026-09-25

Az M4 elkészült. A `0003_goal_versions` migrációval a napi és opcionális étkezési célok hatálynap szerint, profilhoz kötve és atomikusan perzisztensek. A hat stabil étkezési kulcs (`breakfast`, `morning_snack`, `lunch`, `afternoon_snack`, `dinner`, `other`) különválik a Food-kategóriáktól. Nincs automatikus 160 g érték: üres cél „nincs cél”, a rész-célok hiánya nem nulla. A múltbeli nap módosítása látható megerősítéshez kötött, a célverziók a korábbi napok eredményeit nem írják át.

Az új API a `/api/goals`, `/api/goals/summary` és a kategóriás `/api/meals` mezőket adja. A frontend dátumnavigációt, cél-szerkesztő lapot, rész-célokat, semleges eltérésjelzést, kategória-részösszegeket és 0–100%-ra korlátozott vizuális sávot mutat; a szerver számolja a maradékot és a belső, 100% fölé mehető arányt.

Ellenőrzés: Alembic `upgrade head` sikeres `chill_dev` és `chill_test` adatbázison; teljes backend `70 passed, 2 warnings` valódi PostgreSQL-lel; frontend typecheck, lint, `7 passed` unit teszt és build; 390×844 és 360×800 px helyi renderben nincs vízszintes túlcsordulás, a cél- és kategória-flow mentés/törlés működött. A lint egy nem blokkoló React `set-state-in-effect` figyelmeztetést jelez a cél-lap adatbetöltésénél.

A M4 változásai külön helyi commitban kerültek rögzítésre. Push, deploy és éles adatbázis-írás nem történt.

## Railway staging előkészítés — 2026-09-25

A staging előkészítése elkészült, tényleges Railway-erőforrás létrehozása nélkül. Új fájlok: `backend/railway.toml`, `frontend/railway.toml`, `frontend/server.mjs`, `frontend/.env.example`, `frontend/.env.staging.example`, `RAILWAY_STAGING.md`. A meglévő root `railway.toml` readiness útvonala `/api/ready` lett.

A backend `APP_ENV=staging` esetén fail-closed módon PostgreSQL `DATABASE_URL`-t és `STAGING_PROXY_TOKEN`-t követel; a middleware a readiness kivételével token nélkül 401-et ad. A frontend `npm start` production Node gateway: `/healthz` nyilvános healthcheck, minden más útvonal Basic Auth mögött van, az `/api/*` privát backend címre proxyz. A Vite fejlesztési proxyja kizárólag `VITE_DEV_API_URL` változóból olvas; runtime kódban nincs localhost.

A service worker v2 már nem cache-el `/api/` válaszokat. A helyi SQLite/PostgreSQL adatbázisokat nem másoltuk stagingbe, `.env` és titkos érték nem került commitba. A Railway UI lépései és a változók teljes listája a `RAILWAY_STAGING.md`-ben vannak; a backend publikus domainjét nem szabad létrehozni.

Nyitott lépés: Railway-fiókban a staging környezet, PostgreSQL, backend és frontend szolgáltatás létrehozása, majd a titkos Basic Auth/proxy/API értékek kitöltése. Push és deploy nem történt.

Ellenőrzési bizonyíték: backend teljes regresszió `73 passed, 2 warnings` izolált PostgreSQL tesztkapcsolattal; frontend `typecheck`, `lint` (egy meglévő React warning), `7 passed` unit teszt és production build; `node --check` és Python compile ellenőrzés sikeres. A helyi frontend gateway smoke `/healthz=200`, auth nélkül frontend/API `401`, helyes Basic Auth-tal statikus app és proxyzott API `200` eredményt adott. A tényleges FastAPI staging smoke token nélkül `401`, proxy tokennel `/api/health=200`, `/api/ready=200` volt.

## Railway munkakönyvtár-ellenőrzés — 2026-09-25

A Railway monorepo működése alapján a szolgáltatás Root Directoryja határozza meg, honnan futnak a build/deploy parancsok; a config fájl ettől függetlenül abszolút útvonallal választható ki. Ezért `/backend` + `/backend/railway.toml` esetén nincs `cd backend`, és `/frontend` + `/frontend/railway.toml` esetén nincs `cd frontend`. A gyökér `railway.toml` megmaradt repo-root fallbackként, benne a szükséges `cd backend` előtaggal.

Új regressziós teszt (`backend/tests/test_railway_config.py`) TOML-ből ellenőrzi mindhárom konfiguráció parancsait, így a szolgáltatás-root és a fallback formája nem keverhető össze.

## Railway build-hibajavítás — 2026-09-25

A backend build-probléma oka a projektgyökérből történő felismerés és a `pyproject.toml`/`requirements.txt` kettős Python-jelzésének kockázata volt. A `backend/nixpacks.toml` explicit Python providert és `requirements` csomagkezelőt használ, a `.python-version` Python 3.12-t rögzít. A Dashboard Root Directory továbbra is `/backend`, Config File `/backend/railway.toml` kell legyen; ha a napló repo-root felismerést mutat, a Dashboard beállítás nincs ténylegesen alkalmazva vagy rossz config fájl van kiválasztva.

A frontend hibát a `frontend/railway.toml` második `npm ci`-je okozhatta: Nixpacks már az install fázisban telepít, ezért a build most csak `npm run build`. A Vite-kompatibilis Node 22.12.0 az `engines` és `.nvmrc` fájlban rögzített. Az EBUSY utáni első staging buildhez Dashboard Variables között ideiglenes `NO_CACHE=1` szükséges; sikeres build után törlendő.

`.dockerignore` és `.railwayignore` nem került be, mert a `.gitignore` már kizárja a `node_modules`, `dist` és `.env` fájlokat, és a GitHub-forrású Railway build nem ezeket szállítja. Valós Railway rebuildet ebből a munkamenetből nem futtattam.

## Railway staging napló utáni javítás — 2026-09-25

A csatolt Railway napló build utáni futási hibát mutatott: a konténer azonnal az Uvicornnal indult, majd az `app/db.py` helyesen megállította az alkalmazást, mert a PostgreSQL-ben nem volt `foods` tábla. A pre-deploy Alembic futására semmilyen naplóbejegyzés nem utalt.

A tényleges konfigurációs hiba a `preDeployCommand` stringes TOML-alakja volt. A `backend/railway.toml` és a repo-root fallback most tömböt használ (`["alembic upgrade head"]`, illetve `["cd backend && alembic upgrade head"]`), amely megfelel a Railway config-as-code jelenlegi példájának. Mivel az új napló továbbra sem mutatott pre-deploy futást, a backend start-parancsa is idempotensen lefuttatja az `alembic upgrade head` lépést, mielőtt az Uvicorn elindul. A konfigurációs regressziós teszt ezt a típust és a parancsokat is ellenőrzi.

Nyitott külső lépés: a Railway Dashboardban deployáld az új commitot, és a Deployment Details nézetben ellenőrizd, hogy a pre-deploy parancs a `/backend/railway.toml` fájlból származik, sikeresen lefutott, és csak utána jelenik meg a `Starting Container` sor. A staging adatbázisba más műveletet nem kell végrehajtani; helyi titkokhoz nem nyúltam.



## M5 átadás — vendég mód és felhasználói rendszer

A vendég napló az IndexedDB chill-guest-v1 tárat használja, a látható ablak három nap; régebbi rekord importig megmarad. A személyes API-k user profile-t, sessiont és íráskor CSRF-t kérnek. A backend scrypt jelszóhash-t, lejáró tokeneket, HttpOnly/SameSite sessiont, rate limitet és user/registered role-t ad.

A vendégimport szerveroldalon újraszámol, snapshotot/célverziót őriz, idempotens és konfliktusnál rollbackel; a kliens csak siker után töröl. Ellenőrzés: auth 15 passed, PostgreSQL meal/goal 2 passed, Alembic 0005 head dev/test, frontend typecheck/8 unit/build sikeres. A teljes backend futás 73 passed, 3 skipped, 3 Windows pytest-temp ACL error volt.

Korlát: a 360/390 px-es böngészős UI-ellenőrzés nem futott le, mert a környezetben nincs elérhető böngészővezérlés; staging/prod email-delivery adapter és valós Railway deploy sincs bekötve. A következő lépés a böngészős QA, majd csak siker esetén az M5 lezárása.
