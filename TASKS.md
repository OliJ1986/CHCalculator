# Mérföldkövek

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**, M5: **IN PROGRESS**; a felhasználói auth kód- és automatizált kapui bizonyítottak, a módosított UI böngészős kapuja nyitott. A korábbi tesztszámok és élő eredmények történeti bizonyítékok, az új ellenőrzések külön vannak rögzítve.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

- [DONE] M0 — Projektalap és UI prototípus
  - React/Vite/TypeScript frontend, FastAPI alap, PWA, napi képernyő, mock add flow, CH unit tesztek.
- [DONE] M0.1 — Visual Identity & UI Polish
  - CHill brand, Fresh Premium tokenek, egyszerűsített daily hero, line iconok és finom micro-interactionök.
- [DONE] M0.2 — Final UI Cleanup & M0 Closure
  - Motivációs filler eltávolítva, eyebrow szövegek tisztítva, hero hierarchia és desktop shell finomítva, PWA branding ellenőrizve.
- [DONE] M1.1 — Food domain + Open Food Facts integráció + cache + valódi keresés
  - Food domain, provider abstraction, OFF mapping/validáció, SQLite cache/deduplikáció, search és barcode API, valódi frontend keresés.
- [DONE] M1.2 — USDA FoodData Central + generikus ételek + keresési ranking
  - USDA provider, API-key config, fiber-aware CH mapping, magyar aliasok, multi-provider aggregáció, cache és deterministic ranking.
  - M1.2.3-ban a stabil élő integrációs ellenőrzés sikeres lett; a külső átmeneti hibák diagnosztizált, korlátozott retry-vel kezelt esetek.
- [DONE] M1.2.1 — Magyar élelmiszer-kereső, szándékfelismerés és kategorizálás
  - Determinisztikus egyszerű/összetett keresési szándék, relevancia-rangsor, bővített magyar aliasok, forrásnév-megőrzés és konzervatív kategóriák.
  - Backend 27 teszt, frontend typecheck/lint/unit teszt és production build sikeres.
- [DONE] M1.2.2 — USDA tápanyagadatok és találatnevek ellenőrzése
  - A banán-találatok eltérő értékei FDC-, adattípus- és eredeti megnevezés-alapú rekordkülönbségekből származnak; a 1005/1079 számítás nem volt hibás.
  - Javítva a túl tág magyar névleképezés, megőrizve a banana pepper, overripe és egyéb megkülönböztetéseket; bevezetve a nutrient-provenance metaadat és a célzott USDA cache-migráció.
  - Backend 34 teszt, frontend typecheck/lint/unit teszt és production build sikeres.
- [DONE] M1.2.3 — USDA és Open Food Facts integráció stabilizálása
  - A USDA keresés ismételt `dataType` query-paraméterezése HTTP 400-at okozott; a keresés dokumentált POST JSON törzsre váltott tömbös `dataType` mezővel.
  - Az OFF összetett keresés normalizált provider-queryt használ; a 429/5xx, timeout és hálózati hibák korlátozott exponenciális retry-t kapnak, 400-as és hitelesítési hibák változatlanul nem ismétlődnek.
  - A diagnosztikai log forrás, request type, HTTP metódus, keresés, státusz, hibatípus, válaszidő és retry állapotot rögzít, URL és titkos paraméterek nélkül; a provider hibák egymástól izoláltak.
  - Az élő hat-query combined smoke minden kérése 200-as választ adott; a cache/friss provider számlálók és az eredeti nevek ellenőrizve lettek. Backend 40 teszt, frontend typecheck/lint/unit teszt és production build sikeres.
- [DONE] M1.3 — PostgreSQL, Alembic, biztonságos cache-adatátvitel és Railway-előkészítés
  - Elkészült a PostgreSQL-kompatibilis SQLAlchemy-konfiguráció, a tiszta Alembic-alaprevízió, külön dev/test/prod példakonfiguráció és Railway pre-deploy/healthcheck előkészítés; éles deploy nem történt.
  - Elkészült a read-only SQLite audit és import CLI: alapértelmezett dry-run, backup API, SHA-256 leltár, teljes rekord- és strukturált nutrient-egyezés, NULL/0 megőrzés, idempotencia, konfliktusnál tranzakciós rollback és prod-cél tiltás.
  - A tényleges `backend/chill.db` 341 rekordos, integritásellenőrzött backupja megmaradt; a forrás és backup canonical rekord-digestje egyezik. A backup és az adatbázis Gitből kizárt.
  - A helyi PostgreSQL 18 `chill_dev` és `chill_test` adatbázisaihoz a konfiguráció titokmentesen ellenőrizve lett; Alembic `upgrade head` és az ismételt futás mindkét célon sikeres.
  - A 341 rekordos SQLite-forrás dry-runja nem írt; a `chill_dev` import 341/341 rekorddal, teljes mező- és nutrient-egyezéssel, azonos digesttel sikeres. Az ismételt import 341 azonos és 0 új rekordot adott.
  - Valódi PostgreSQL-en CRUD, source/source_id egyediség, konfliktusos import és tranzakciós rollback sikeres; a `chill_test` fixture-takarítása után nem maradt próbarekord. A SQLite-forrás és backup változatlan maradt.
  - A PostgreSQL timezone-os visszaolvasás miatt szükséges UTC-normalizálás bekerült az importba; az Alembic in-process futtatása megőrzi az alkalmazási/provider loggereket. Backend: 48 teszt sikeres, frontend: typecheck, lint, 4 unit teszt és production build sikeres.
- [DONE] M2 — CH kalkulátor
  - A backend és frontend ugyanazt a pozitív, véges gramm- és 0–100 g/100 g CH-tartományt ellenőrzi; a technikai felső mennyiséghatár 100 000 g.
  - A `POST /api/carbs/calculate` endpoint kerekítés nélküli eredményt ad; a frontend vesszős/pontos inputot, gyorsgombokat, +/- lépést, hiányzó CH-t és hibás mennyiséget kezel.
  - Mobil UI ellenőrzés 390 és 360 px szélességen sikeres, vízszintes túlcsordulás nélkül; 55 g × 11,4 g/100 g = 6,27 g, 12,5 g × 21 g/100 g = 2,625 g → 2,6 g kijelzés.
  - Backend 62 teszt, frontend 7 unit teszt, typecheck, lint és production build sikeres.
- [DONE] M3 — Napi étkezési napló
- [DONE] M4 — CH célok és étkezések
- [IN PROGRESS] M5 — Vendég mód, regisztráció és felhasználói rendszer
- [TODO] M6 — Vonalkód és OCR
- [TODO] M7 — AI funkciók

M0, M1.1, M1.2, M1.3, M2, M3 és M4 lezárva; M5 kódja elkészült, a módosított UI böngészős kapuja nyitott; az M1.2 élő USDA/OFF combined smoke-ja lezárt történet. 2026-09-25-én az új katalógus/tervező scope automatikus és PostgreSQL kapui elkészültek; a böngészős mobil QA továbbra is nyitott.

## M8 — Saját ételek [AUTOMATIZÁLT KAPUK TELJESÜLTEK]

- [x] Profilhoz kötött saját étel CRUD, kedvenc kapcsoló és CH/100 g validáció.
- [x] Saját ételek meal-snapshot forrásként használhatók; más profil rekordja nem olvasható.
- [x] Vendég saját ételek IndexedDB-ben, additive adatbázis-verziófrissítéssel.
- [x] Regisztrációkor a vendég saját ételek explicit megerősítéssel, idempotens importtal átvihetők a profilba.
- [x] Backend unit/regresszió és frontend persistence teszt sikeres.

## M9 — Receptek és receptnapló [AUTOMATIZÁLT KAPUK TELJESÜLTEK]

- [x] Profilhoz kötött recept/hozzávaló CRUD, determinisztikus össz- és adagonkénti CH.
- [x] Hozzávaló-snapshot és receptnapló-snapshot rögzül; hiányzó CH elutasítva.
- [x] Gramm- és adag-alapú receptnaplózás, idempotencia-kulcs.
- [x] Vendég recepttár IndexedDB-ben és mobil katalógusnézet.

## M10 — Étkezéstervező [AUTOMATIZÁLT KAPUK TELJESÜLTEK]

- [x] Profilhoz kötött napi terv saját ételhez vagy recepthez, kategóriával és CH-snapshot-tal.
- [x] Terv CRUD és mennyiségmódosítás újraszámítással; a terv nem írja át a naplót.
- [x] A kiválasztott terv egy művelettel tényleges naplóbejegyzéssé tehető; vendégként a művelet IndexedDB-snapshotot készít.
- [x] Vendég tervek IndexedDB-ben, mobil tervezőnézetben kezelhetők.

## M11 — Bevásárlólista [AUTOMATIZÁLT KAPUK TELJESÜLTEK]

- [x] Kézi lista CRUD és tervből generált, név+kompatibilis mértékegység szerint aggregált tételek.
- [x] Profil-szigetelés, checked/source mezők és vendég IndexedDB tárolás.
- [x] API, unit és frontend persistence ellenőrzések sikeresek.

Közös nyitott kapu: a jelenlegi környezetben nincs böngészővezérlés, ezért az M5 és az M8–M11 módosított mobil UI-jának 360/390 px vizuális, fókusz- és PWA-telepítési ellenőrzése nem jelölhető sikeresnek.

## Közös teljesítési kapu

A mérföldkő csak akkor DONE, ha az összes kötelező elfogadási feltétel bizonyított. Az M1.3–M4 sorrend teljesült; M5-nél a közös böngészős UI-kapu nyitott. M6–M7 és a katalógus további, nyitott scope.

- [x] Induláskor a tényleges kód, Git-állapot, konfiguráció és meglévő tesztparancsok felmérése; alapellenőrzés. A történeti 40 backend/4 frontend teszt nem elvárt végső darabszám.
- [x] Minden mérföldkőnél célzott regressziók, teljes backendteszt, frontend typecheck, lint, nem figyelő módban futó unit teszt és production build sikeres.
- [ ] Módosított UI: legalább 360 és 390 px szélességen, világos/sötét témában használható; billentyűzetfókusz, feliratok, hibák, érintési célok és vízszintes túlcsordulás ellenőrizve. Ha nincs böngészős QA, ez nyitott ellenőrzés marad.
- [x] TASKS, HANDOVER, CHANGELOG és érintett architektúra/döntések frissítve; csak az adott munkához tartozó fájlokból érthető helyi commit. A commit hash és a tényleges teszteredmény az átadásban szerepel.

### M5 — Vendég mód, regisztráció és felhasználói rendszer [IN PROGRESS — kód elkészült]

- Vendég napló/cél az IndexedDB chill-guest-v1 tárban; láthatóan az aktuális és előző két nap. Régebbi rekordot a data layer nem töröl, exportkor megmarad.
- User, Profile, session, verification/reset token és login-attempt táblák; 0004_user_accounts és 0005_user_role migráció. A default-profile nem kerül automatikusan userhez.
- A személyes API-k hitelesített user profile-ra szűrnek; íráskor CSRF-token kell. A session cookie HttpOnly/SameSite, staging/prod módban Secure. A jelszó scrypt KDF.
- A vendégimport explicit megerősítés után, szerveroldali CH-újraszámolással, snapshot/célverzió-megőrzéssel, idempotenciával és konfliktusos rollbackkel fut.

### Elfogadás

- [x] Vendég API-hozzáférés tiltott; IndexedDB háromnapos nézet, export/import tesztelt.
- [x] Regisztráció → email-megerősítés → login → CSRF → logout, jelszócsere/reset és rate limit tesztelt.
- [x] Auth/regresszió 15 passed; PostgreSQL meal/goal integráció 2 passed; frontend typecheck, 8 unit teszt, build sikeres.
- [x] Dev/test PostgreSQL Alembic head 0005_user_role; helyi adatot nem töröltünk.
- [x] A vendég indulás auth-válasz nélkül is használható; a PWA manifest és az API-válaszokat kizáró service-worker szabály ellenőrzött.

Korlát: a módosított M5 UI 360/390 px-es böngészős, fókusz- és túlcsordulás-ellenőrzése a környezetben elérhető böngészővezérlés hiánya miatt nem futott le; staging/prod email-delivery adapter és valós Railway deploy sincs bekötve/végrehajtva. M5 csak ezek után jelölhető DONE-nak.

## Railway staging utólagos naplóellenőrzés — 2026-09-25

- A staging konténer naplója szerint az Alembic pre-deploy lépés nem futott le; az Uvicorn importja hiányzó PostgreSQL-séma miatt állt le.
- A backend és a repo-root fallback `preDeployCommand` mezői Railway-kompatibilis TOML-tömbök lettek. A következő staging deploymentben a migráció sikerét az alkalmazás konténer indulása előtt kell ellenőrizni.
- A backend start-parancsa is tartalmazza az idempotens `alembic upgrade head` védelmi lépést, így a pre-deploy kihagyása nem engedi migrálatlan sémával indulni az alkalmazást.

## M1.3 — PostgreSQL / Alembic / Railway-előkészítés [DONE]

### Megvalósítás

1. Mérd fel a SQLite tényleges sémáját és összes tábláját, a cache-forrásokat, kulcsokat, indexeket, payloadokat, NULL-okat és verziókat. A 123 USDA-sor és mapping_version=4 történeti állapot; mindig az aktuális forrásból készíts leltárt. Ismeretlen, nem cache-adat esetén ne hagyj ki táblát csendben: dokumentáld és tisztázd az adatátviteli scope-ot.
2. PostgreSQL legyen az M1.3 utáni fejlesztési és tervezett éles motor. Maradjon SQLAlchemy 2.x; válassz kompatibilis drivert a meglévő szinkron/aszinkron működéshez. Adj reprodukálható helyi indítást (Docker Compose, vagy dokumentált meglévő PostgreSQL). Rögzíts verziót és függőségeket.
3. Külön dev, test és prod adatbázis, külön jogosultságok és konfiguráció. A tesztek csak kijelölt, eldobható test DB-t módosíthatnak. Hibás/hiányzó PostgreSQL-konfigurációnál egyértelmű hiba legyen, ne csendes SQLite-visszaesés. Ne logolj kapcsolati URL-t vagy jelszót.
4. Alembic alaprevízió a Food/cache sémához, egyértelmű revíziólánccal. A generált migrációt kézzel ellenőrizd. PostgreSQL-ben ne az alkalmazásindulás végezzen create_all/ad hoc DDL-t; az Alembic legyen a séma forrása. A USDA mapping_version adatleképezési verzió, nem Alembic-revízió; a meglévő célzott, rekordmegőrző viselkedés maradjon.
5. Külön, kézzel indítható SQLite → PostgreSQL importeszköz: dry-run az alapmód, explicit forrás és cél, dev/test cél-ellenőrzés. A forrás csak olvasható. Írás előtt konzisztens SQLite-backup készüljön backup API-val vagy igazoltan leállított írók mellett, WAL-kezeléssel; integritásellenőrzés és SHA-256 leltár. A forrás és a backup nem törölhető.
6. Az import konzisztens backupból dolgozzon. Őrizze meg a source/source_id azonosságot, neveket, kategóriát, numerikus tápanyagértékeket, NULL/0 különbséget, source_payloadot és mapping_versiont. Ne hívjon külső providert és ne számítsa újra az adatokat. Új belső ID esetén készíts leképezést; minden érintett kapcsolatot őrizz meg, sequence-eket ellenőrizz.
7. Tranzakciós, idempotens import: azonos source/source_id és azonos tartalom kihagyható, eltérő tartalom konfliktus és rollback; nincs automatikus felülírás vagy adateldobás. Hibás/duplikált forrásrekord jelentést és sikertelen kilépést adjon. Megszakítás után ismételhető legyen. Párhuzamos import/írás ne változtassa meg az ellenőrzött állapotot.
8. Import előtt és commit előtt ellenőrizd a darabszámot forrásonként, a kulcshalmazt, a duplikációkat és **minden migrált rekord** tápanyag- és metaadat-egyezését. Decimal-alapú numerikus összevetés, strukturált JSON-egyezés, NULL és 0 külön kezelése; önkényes toleranciával ne rejts el eltérést. Meglévő céladatnál külön számláld a beszúrt/azonos/konfliktusos sorokat, a nem érintett sorokat is őrizd meg. Eltéréskor rollback és hibajelentés.
9. Átállítás csak sikeres import, visszaolvasás és cache/provider regresszió után. Dokumentáld a visszaállítást: eredeti SQLite és backup megmarad; új PostgreSQL-írások után a régi SQLite-ra visszakapcsolás adatvesztést okozhat, ezért ilyenkor nem automatikus rollback a megoldás, hanem egyeztetett visszaállítás/előre javítás.
10. Railway konfiguráció és telepítési leírás előkészítése: külön backend/PostgreSQL szolgáltatás, környezethez rendelt DATABASE_URL, titkos változók, PORT, healthcheck, engedélyezett frontend-origin, frontend API-cím. Alembic upgrade head külön pre-deploy lépésben; sikertelen migráció akadályozza meg az új verzió indítását. Lokális import ne legyen deploy-hook. Tényleges felhős szolgáltatáslétrehozás, fizetős művelet vagy éles deploy nem része az autonóm feladatnak.

### Elfogadás

- [x] Tiszta dev PostgreSQL-en Alembic upgrade head sikeres, az ismételt futás nem változtat adatot; sémarevízió és ORM egyezése igazolt.
- [x] Valódi, külön test PostgreSQL-en cache CRUD/upsert, source/source_id egyediség és keresési regressziók sikeresek. SQLite-only teszt nem igazolja ezt a kaput.
- [x] Dry-run nem ír; import és ismételt import, konfliktus/hibás rekord, megszakítás és rollback tesztelve. A teljes rekord-összevetés sikeres; forrás és backup sértetlen.
- [x] A tényleges helyi cache importja és dev PostgreSQL-ből visszaolvasása ellenőrzött; a forrás és backup elérhető és változatlan.
- [x] Dev/test/prod célok elkülönítése és veszélyes/azonos célokra adott elutasítás tesztelve, titkok nem jelennek meg a logban.
- [x] Railway-előkészítés és helyi indítás ellenőrzött; a valós Railway-deploy külön, nem végrehajtott lépésként szerepel. Hiánya önmagában nem akadálya az előkészítési mérföldkő lezárásának.
- [x] M1.2.3 regressziók megmaradtak; a korábbi élő USDA/OFF smoke eredménye külön történeti bizonyíték, cache-es HTTP 200-at nem használtunk új élő bizonyítékként.

## M2 — Teljes CH-kalkulátor [DONE]

### Megvalósítás

- A meglévő keresés és kiválasztás bővítése; cache/USDA/OFF eredmények, magyar és eredeti név, márka, source/source_id és ételkategória megkülönböztethető. Eltérő FDC rekordok ne olvadjanak össze, új egységes alapanyag-katalógus nem része a scope-nak.
- Grammbevitel, meglévő gyorsgombok és +/- használata, azonnali újraszámítás. Magyar tizedesvessző és pont elfogadása egyértelmű normalizálással. Üres, nem véges, nem szám, nulla vagy negatív mennyiség nem menthető; a felső technikai határt és pontosságot dokumentáld és mindkét oldalon azonosan validáld.
- Változatlan képlet: amount_g × available_carbs_100g / 100. A valid 0 CH számolható; a NULL/hiányzó/ellentmondó CH nem nulla, és nem becsülhető. USDA rostlevonás csak a mapperben, OFF értékből nincs újabb rostlevonás.
- Számítás és összesítés kerekítetlen értékből; megjelenítés egy tizedes g, dokumentált és tesztelt kerekítéssel. A forrás pontossága maradjon meg. Keresési loading/üres/hiba, nem számolható találat, bevitelhiba és újrapróbálás érthető UI-t kapjon.
- M2 még nem ígér tartós naplót; ezt M3 biztosítja. A meglévő prototípus alapértékei nem felhasználói célok.

### Elfogadás

- [x] 55 g és 11,4 g/100 g → 6,27 g belső érték, 6,3 g kijelzés; 100 g → a forrásérték; valid 0 CH → 0; törtmennyiség és vesszős input helyes.
- [x] Negatív/0/üres/NaN/végtelen mennyiség és hiányzó CH esetén nincs érvényes eredményként mentés; a hiba kijavítása után helyreáll a flow.
- [x] Gyorsgomb, kézi bevitel és ételváltás ugyanazt a determinisztikus számítást használja; nincs elavult eredmény vagy dupla rostlevonás.
- [x] Azonos magyar nevű eltérő forrásrekordok azonosíthatók; relevancia/ranking és banánpaprika-regresszió változatlanul sikeres.
- [x] Mobilon teljes keresés → kiválasztás → mennyiség → eredmény flow működik; közös teljesítési kapu teljesült.

## M3 — Tartós étkezési napló, tápanyag-pillanatképpel [DONE]

### Elkészült és ellenőrzött M3-kapu

- `0002_meal_log_snapshot` létrehozza a profil- és naplótáblát; a FastAPI `/api/meals` CRUD-ot és napi, helyi dátum szerinti kerekítetlen összesítést ad.
- A szerver UTC-ben tárolja az időpontot, rögzíti az IANA-zónát és a helyi napot, explicit offset nélküli időpontot elutasít; a snapshot a nevet, eredeti nevet, forrást, source_id-t, márkát, CH/rost/tápanyag-provenance adatokat és verziókat őrzi.
- A kliens CH-értéke csak ellenőrzött előnézet; a szerver számol. Idempotencia-kulcs, snapshotból történő mennyiségszerkesztés, explicit ételcsere, hibatartó UI, valódi lista és megerősített törlés elkészült.
- Valódi `chill_test` PostgreSQL-en a CRUD, idempotencia, DST/napváltás és üres nap tesztje sikeres; a teljes backend regresszió 66 tesztje zöld. Frontend typecheck, lint, 7 unit teszt és build zöld; böngészős QA 390/360 px-en túlcsordulás nélkül sikeres.

### Megvalósítás

- Alembic-migrációval naplómodell és PostgreSQL-tárolás; API létrehozás/listázás/szerkesztés/törlés/napi összesítés, frontend-integráció. A mock lista és mock összeg kikerül a valódi naplófolyamból, nem importálódik valós étkezésként.
- Tárolandó: bejegyzésazonosító, profilazonosító, elfogyasztás időpontja időzóna-adattal, rögzített helyi nap és IANA-időzóna, gramm, étkezési kulcs (M3-ban other), létrehozás/módosítás ideje, snapshot és számított CH. UTC időpont + rögzített helyi nap biztosítja, hogy későbbi eszköz-időzónaváltás ne sorolja át csendben a régi napokat. Alap időzóna Europe/Budapest, a profilban explicit rögzítve.
- Snapshot: magyar és eredeti ételnév, source/source_id, márka ha van, available_carbs_100g, rendelkezésre álló total/fiber és nutrient-provenance, mértékegység, mapping/calculation verzió és pillanatkép ideje. Hiányzó opcionális nutrient NULL marad. A cache-re mutató kapcsolat opcionális; cache-frissítés/törlés nem törölheti és nem módosíthatja a napló bizonyító adatait.
- A szerver ellenőrzi a kiválasztott élelmiszer adatait, készíti a snapshotot és számítja a CH-t; kliens által beküldött összegben nem bízik. Az M2-ben látott és mentéskor elérhető nutrient eltérése esetén ne mentsen észrevétlenül más értéket: frissített előnézet és új mentés szükséges.
- Mennyiség szerkesztése az eredeti snapshotból számol újra; dátum/kategória módosítása nem frissít nutrientet. Explicit ételcsere új snapshotot készít. Providerkieséskor a már naplózott adatok megtekintése és mennyiségszerkesztése tovább működik.
- Sikeres szervermentés után frissüljön a napi összeg. Sikertelen kérés ne jelenjen meg tartós mentésként; függő mentés alatt dupla kattintás tiltva, újrapróbálásnál idempotenciakulcs védjen a duplikálástól. Törlés előtt felhasználói megerősítés; tranzakciós írás és következetes szerverválasz.
- M1.3–M4 alap scope: egy privát, egyfelhasználós profil, nem teljes auth-rendszer. A profil a szerveren kijelölt, nem tetszőleges kliens-ID. Auth nélküli napló nem publikálható nyilvános internetre; Railway-előkészítéshez ezt korlátozásként dokumentáld, publikus/multifelhasználós kiadás előtt külön hozzáférésvédelmi döntés kell.

### Elfogadás

- [x] Hozzáadás, listázás, dátumváltás, mennyiség/étel/időpont szerkesztése és törlés integrációs tesztje valódi test PostgreSQL-en sikeres.
- [x] Oldalfrissítés és backend-újraindítás után minden mentett bejegyzés és összeg visszaolvasható; üres nap összege 0.
- [x] Cache nutrient/name változtatása vagy cache-rekord törlése után a meglévő bejegyzés snapshotja és CH-ja változatlan. 55 g × 11,4/100 = 6,27; későbbi cache=20 mellett 100 g-ra szerkesztve a régi snapshotból 11,4 g marad.
- [x] Napi összeg kerekítetlen bejegyzésértékek összege; csak a végső kijelzés kerekített. Éjfél, napváltás, Europe/Budapest nyári/téli időszámítás és időzónaváltás tesztelt; kétértelmű helyi időhöz offset szükséges, nem létező idő elutasítandó.
- [x] Dupla küldés/timeout utáni retry nem hoz létre két sort; sikertelen mentés nem módosítja a tartós összesítőt. Szerver elutasít hamis CH-t és nem megengedett profilhoz tartozó műveletet.
- [x] Offline/szerverhiba érthetően jelzett, nincs hamis „mentve” állapot. PWA nem cache-el privát napló API-választ általános cache-first szabállyal; teljes offline szinkron nem része M3-nak.
- [x] Közös teljesítési kapu teljesül, a korábbi 84/160 mock állapot nem látszik valós adatként.

## M4 — Felhasználói CH-célok és étkezések [DONE]

### Megvalósítás

- Felhasználó által megadott, tartós napi CH-cél; nincs automatikusan kiosztott 160 g vagy orvosi ajánlás. A hiányzó cél külön állapot, összeg továbbra is látható. Pozitív véges grammérték szükséges; 0/negatív/nem szám elutasítandó. A cél törlése „nincs cél” állapotot jelent, nem 0-val osztást.
- Stabil kulcsok és magyar címkék: breakfast/reggeli, morning_snack/tízórai, lunch/ebéd, afternoon_snack/uzsonna, dinner/vacsora, other/egyéb. Ezek az étkezési kategóriák különböznek a Food ingredient/processed/packaged/other osztályozásától. Korábbi M3-bejegyzések other értéket kapnak; felhasználó módosíthatja, automatikus időalapú átsorolás nincs.
- Opcionális pozitív cél étkezésenként. Hiányzó rész-cél nem 0. A rész-célok összege eltérhet a napi céltól; a UI jelezze az eltérést, de ne ossza át vagy írja felül a felhasználó értékeit. Napi cél hiányában rész-cél is megadható, a napi százalék ilyenkor nem számolható.
- Napra érvényes célverziók: új napi/rész-cél alapértelmezetten a kiválasztott helyi naptól érvényes a következő verzióig; korábbi napok változatlanok. Múltbeli hatály megadása explicit, látható művelet. Az adott naphoz a legutolsó nem későbbi célverzió tartozik; cél nélkül maradt régi napnak nincs kitalált célja. Egy profil/hatálynap egy egyértelmű verzió; napi és rész-cél mentése atomikus.
- Elfogyasztott CH a napló snapshot-összege; maradék = cél − elfogyasztott, negatív érték helyett/ mellett egyértelmű „túllépés X g”. A progress sáv vizuálisan 0–100%-ra korlátozott, az adatból számolt arány 100% fölé is mehet. Nincs cél esetén nincs százalék/sávval sugallt cél. A korábbi vizuális döntés szerint külön százalék-kijelző nem szükséges.

### Elfogadás

- [x] Napi cél és opcionális rész-célok mentés, újratöltés és backend-újraindítás után megmaradnak; hiányzó, törölt, 0, negatív és hibás érték kezelése tesztelt.
- [x] 160 g cél, 84 g fogyasztás → 76 g maradék, belső arány 52,5%; 175 g fogyasztás 160 g cél mellett → 15 g túllépés, sáv legfeljebb 100%. Cél nélkül nincs osztás és nincs alapértelmezett 160 g.
- [x] Minden kategória részösszege együtt pontosan a napi összeg; hozzáadás, törlés, mennyiség- és kategóriaváltás azonnal konzisztens eredményt ad.
- [x] Mai célszerkesztés nem írja át a tegnapit; cél előtti nap, jövőbeli hatály, explicit múltbeli módosítás és cél törlésének hatálya tesztelt.
- [x] Rész-célok összege napi céltól eltérhet, erről semleges jelzés látszik; nincs automatikus étrendi számítás vagy keretmódosítás.
- [x] Korábbi napok nézete és mobil UI működik; M5 lezárult; M6–M7 és a katalógus nincs implementálva.

## Railway staging előkészítés — előkészítve, deploy nélkül

- [x] Külön backend- és frontend-konfiguráció készült, a szolgáltatások saját root directoryval és healthcheckkel használhatók.
- [x] A backend staging módban PostgreSQL-t és proxy tokent követel meg; a frontend runtime gateway vendégként nyilvánosan megnyitható, a backend publikus domain nélkül marad.
- [x] A frontend production buildje nem tartalmaz beégetett localhost API-címet; a `/api` kérések privát backend-proxyra mennek.
- [x] Backend Nixpacks Python 3.12 és `requirements.txt` telepítő rögzítve; frontend Node 22.12.0 és lockfile-kompatibilis install/build útvonal rögzítve.
- [x] A frontend buildből kikerült a második `npm ci`, amely az install fázis után EBUSY cache-hibát okozhatott.
- [x] A service worker személyes `/api` válaszokat nem cache-el.
- [x] A frontend gateway Basic Auth nélkül, vendégként megnyitható; a `BACKEND_PROXY_TOKEN` megmaradt, a backend személyes API-védelme változatlan.
- [x] A részletes Railway UI telepítési útmutató a `RAILWAY_STAGING.md` fájlban van.
- [x] A backend/frontend Root Directoryhoz igazított parancsok és a repo-root fallback külön regressziós teszttel ellenőrzöttek.
- [ ] Valós Railway projekt létrehozása, titkos staging változók kitöltése és deploy. Ez külön, felhasználói hozzáférést és biztonsági döntést igénylő művelet; ebben a feladatban nem történt meg.


### Ellenőrzött megvalósítás — 2026-09-25

- Az Alembic `0003_goal_versions` migráció és a `GoalVersion` modell profilhoz kötött, hatálynap szerinti, egyedi célverziókat tárol; a napi és kategória-célok egy tranzakcióban menthetők, üres mentés pedig külön „nincs cél” állapotot hagy.
- A `/api/goals`, `/api/goals/summary` és a hat kategóriás `meal_category` szerződés szerveroldali validációval működik. A korábbi nap módosítása explicit `allow_past` engedélyt kér; a régebbi napok a korábbi verziót használják.
- A kategória-összegek a mentett étkezési snapshot-CH-ból készülnek. A 160/84 példa 76 g maradékot és 52,5%-os belső arányt ad; 175 g fogyasztásnál 15 g túllépés és legfeljebb 100%-os vizuális sáv jelenik meg.
- A frontend dátumnavigációt, cél-szerkesztő lapot, múltbeli megerősítést, hat kategóriát és kategória-részösszegeket mutat. Valós helyi renderben 390×844 és 360×800 px-en `scrollWidth == clientWidth`; cél mentés, kategória-rész-cél és törlés API-n keresztül ellenőrizve.
- Kapuk: teljes backend `70 passed, 2 warnings` valódi `chill_test` PostgreSQL-lel; Alembic head dev/test-en; frontend typecheck, lint, `7 passed` unit teszt és production build; mobil render/interakció sikeres.
- M4 után az autonóm fejlesztés megáll. A privát `default-profile`, auth, teljes offline szinkron, M5–M7 és új katalógus továbbra is korlátozás.

## M12 — Mobil UX 2.0 [IMPLEMENTED — böngészős QA nyitott]

- Az alsó navigáció pontosan öt elemre váltott: Ma, Ételek, Hozzáadás, Tervező, Profil. A központi Hozzáadás gomb megnyitja a gyors naplózási sheetet; a korábbi Kamera elsődleges navigációja megszűnt.
- Az Ételek nézet saját ételeket, kedvenceket és recepteket kezel; a heti tervező külön Tervező nézetben érhető el. A gyors hozzáadás megőrzi a kiválasztott napot, és másik nap esetén egyértelmű jelzést mutat.
- A napi hero, kategóriaösszegzés és profil kisebb mobil képernyőkre tömörebb lett; a safe-area és az alsó navigációs tartalékhely megmaradt.
- Automatizált kapuk: backend 84 passed, frontend 9 unit passed, typecheck és build passed. A lint csak a meglévő React effect/dependency figyelmeztetéseket jelzi.
- Korlát: ebben a környezetben nincs böngészővezérlés, ezért 360/390 px vizuális, billentyűzet- és PWA-ellenőrzés nem bizonyított.

## M13 — Receptek 2.0 [IMPLEMENTED — böngészős QA nyitott]

- Elkészült a mobil receptlista, részlet/szerkesztő és törlés/kedvenc művelet. A szerkesztő név, leírás, elkészítési idő, adag, opcionális főtt össztömeg és több külső/saját hozzávaló kezelését biztosítja.
- A backend minden hozzávaló CH-adatát szerveroldalon validálja, determinisztikusan számolja az össz- és adagonkénti CH-t, és csak megadott főtt össztömegnél ad CH/100 g főtt értéket. Nyers hozzávalók összegéből főtt érték nem következik.
- A recept-hozzávaló- és receptnapló-snapshotok megmaradnak; teljes adag naplózható, vendég és hitelesített módban is. A szerkesztő elhagyásakor megerősítés védi a félkész változásokat.
- Új backend regressziók igazolják a főtt CH/100 g számítást és a tervmásolás idempotenciáját. A teljes backendkészlet PostgreSQL-lel 84 passed; frontend 9 unit passed, typecheck és build passed.
- Korlát: a böngésző nélküli környezetben mobil érintési, fókusz- és vizuális QA nem futott.

## M14 — Planner 2.0 [IMPLEMENTED — böngészős QA nyitott]

- A Tervező heti nézetet kapott hétfő–vasárnap napválasztóval, előző/következő hét navigációval, aktuális nap kiemeléssel és helyi dátumformátummal. A lekérés egy heti tervtartományra történik, a kiválasztott nap tényleges naplója külön marad.
- A napi terv mutatja a tervezett és tényleges CH-t, valamint a napi cél jelenlegi verzióját. A terv külön adat marad a naplótól; egy művelettel naplózható, idempotencia-kulccsal.
- A terv áthelyezhető, következő napra másolható duplikációvédelemmel, és a heti bevásárlólista frissíthető. A planner által generált tételek újragenerálása mennyiséget cserél, kézi tételeket és azok jelölését megőrzi.
- Vendég módban az IndexedDB-lista idempotensen frissül; hitelesített módban a meglévő PostgreSQL API-k és profil-szigetelés maradnak érvényben.
- Új regresszió igazolja a planner bevásárlólista ismételt generálásának stabil mennyiségét; a teljes backend PostgreSQL-készlet 84 passed, frontend 9 unit passed, typecheck/build passed.
- Korlát: nincs elérhető böngészővezérlés, ezért a 360/390 px-es mobil vizuális, fókusz- és PWA telepítési QA nyitott marad; ezt nem jelölöm automatizáltan sikeresnek.

### M12 gyors hozzáadás kiegészítés
- A gyors sheet üres keresési állapotban kedvenc saját ételeket és kedvenc recepteket kínál; a recept egy adaggal, az adott napra és kiválasztott kategóriával naplózható.

## 2026-09-26 — Mobil QA hibajavítás

- Az App.tsx-ben feltárt ok: több magyar felirat UTF-8 tartalma Windows-1250-ként dekódolva került a forrásba (például `TĂ­zĂłrai`, `EbĂ©d`, `EgyĂ©b`). A javítás célzott, visszafordítható mojibake-táblával történt; vak globális karaktercsere nem történt.
- A teljes `frontend/src` forrás átvizsgálása után azonos jellegű kódolási hiba csak az App.tsx-ben volt. Backend-forrásban és a tesztelt API-adatútban ilyen forráskódolási jel nem jelent meg. A meglévő IndexedDB-, PostgreSQL- és snapshot-adatokhoz nem nyúltunk.
- Új `encoding.test.ts` regresszió tiltja a gyakori UTF-8/Windows-1250 mojibake-mintákat, és ellenőrzi a kulcsfontosságú magyar feliratokat.
- A kis képernyős kártyafejécek reszponzív tördelést kaptak. A bevásárlólista műveleti gombjai 360 és 390 px-en a kártyán belül maradnak; a heti tervező hasonló fejlécét is ellenőriztük.
- A service worker `chill-m14-v1` cache-verziót használ, aktiváláskor eltávolítja a régi verziókat, a regisztráció `updateViaCache: 'none'`, és az `/api/` válaszok továbbra sem kerülnek cache-be. Ezt a `pwa.test.ts` ellenőrzi.
- Playwright QA: Chromium és WebKit, 360×800 és 390×844; főképernyő, Ételek, Tervező, Profil, alsó navigáció, magyar szöveg és vízszintes túlcsordulás sikeres. A helyi backend nem futott, ezért az API/provider- és fiókfolyamatok élő böngészős ellenőrzése nincs állítva sikeresnek.
- Ellenőrzések: frontend unit 12 passed, typecheck passed, production build passed, lint passed 5 meglévő React warninggel. A Playwright futtatás ideiglenes scriptjei törölve lettek.

## M15-M18 - CHill Camera [IMPLEMENTED - integration gate open]

- M15: the Add sheet has a Camera panel with Barcode, Nutrition and Food photo modes. The shared camera component requests permission only after an explicit action, supports rear/front camera switching, image capture and file upload, handles permission errors, and stops streams on close.
- M16: ZXing supports EAN-8/EAN-13 live, image and manual input. The code uses the existing `/api/foods/barcode/{barcode}` OFF provider/cache path; unknown or CH-missing products are not logged automatically.
- M17: Tesseract.js is loaded locally only when OCR starts. The parser keeps carbohydrates, sugars, fibre, 100 g, 100 ml and serving bases separate and accepts decimal commas. Only user-reviewed 100 g data can create a custom food; no raw image is persisted.
- M18: the backend `/api/vision/food` adapter and deterministic mock provider are implemented. Gemini credentials are backend-only, the feature is disabled by default, and image size, per-minute and daily limits are enforced. AI returns names and possible ingredients only; it never estimates CH.
- Checks: frontend 14 unit tests passed, typecheck/build/lint passed (five existing React warnings); backend food-vision mock/provider tests 5 passed. Playwright Chromium/WebKit checks passed at 360x800, 375x812 and 390x844 for the camera panel, three tabs and horizontal overflow.
- Open gates: the stale goal regression dates are now derived from the Budapest-local test date; the full backend suite reaches `85 passed, 4 skipped` with one existing Starlette/httpx deprecation warning when run in an isolated workspace temp directory. Real Gemini calls were intentionally not run; physical iPhone camera permission remains manual QA.

## 2026-09-26 - M15-M18 camera regression fix

## 2026-09-26 – Nutrition OCR 2.0 és vonalkódos hibakezelés

- [x] A tápérték-parser magyar és angol sorokat táblázatos sorlogikával értelmez: szénhidrát, ebből cukrok, rost, fehérje és zsír külön mező; a hiányzó adat `null`, a nulla érvényes érték marad.
- [x] A 100 g, 100 ml és adag alapú adatok nem keverednek. A saját étel mentése csak felülvizsgált 100 g-os CH-val engedélyezett, átszámítás nélkül.
- [x] A NutritionScanner helyi képkivágást, méretezést és opcionális kontrasztjavítást ad; minden OCR-mező és a tápértékalap szerkeszthető. Sikertelen OCR után kézi saját étel menthető.
- [x] Hozzáadtuk a Koch's Original Majonéz magyar/angol fixture-t, parser-regressziókat, Chromium/WebKit mobil tesztet 360, 375 és 390 px-en; a képek nem kerülnek külső szolgáltatóhoz.
- [x] Az OFF 404-es ismeretlen vonalkód normál üres találat, a frontend pedig külön kezeli a 401/403, 429, 5xx és hálózati hibákat. A 200-as cache-találat változatlanul elsőbbséget élvez.
- [x] Frontend kapuk: 24 Vitest teszt, typecheck, lint (5 meglévő React-figyelmeztetés), production build; Chromium 9/9 és WebKit 9/9 mobil kamera/OCR teszt.
- [x] Backend célzott provider-kapu és barcode endpoint-kapu: 16 teszt sikeres; a teljes futásban 83 teszt sikeres és 4 skip, 3 cache-import teszt setupját a Windows pytest ideiglenes könyvtár ACL-je blokkolta (implementációs hiba nélkül).
- [ ] Valós iPhone Safari OCR-kamera és élő Railway/OFF smoke ebben a munkamenetben nem futott; ez külön eszköz- és staging-hozzáférést igényel.

## 2026-09-27 – Nutrition OCR 2.1 érintésvezérelt kivágás

- [x] A négy csúszka helyett a teljes feltöltött kép fölött mozgatható, négy 44 px-es érintési célú fogantyúval rendelkező kijelölőkeret működik.
- [x] A kijelölés mozgatása és minden sarok átméretezése normalizált koordinátákon történik; a keret a kép határain belül marad, legalább 12% szélességű és magasságú.
- [x] A kijelölésen kívüli terület elsötétül, a „Teljes kép kijelölése” visszaállítja az alapállapotot, az eredeti Blob a feldolgozás végéig megmarad, a billentyűzetes csúszkák lenyitható alternatívaként megmaradtak.
- [x] A vizuális koordináták ugyanazzal a forráspixel-átalakítással kerülnek a canvasba és az OCR-be; a normalizált → pixel leképezést unit teszt, a tényleges feldolgozott részletet fejlesztési diagnosztika és Playwright ellenőrzi.
- [x] Álló és fekvő képre, kép-határokra, fogantyú-átméretezésre és OCR-folyamatra Chromium/WebKit teszt készült 360×800, 375×812 és 390×844 méreten: mindkét motorban 12/12 teszt sikeres (összesen 24).
- [x] Frontend kapuk: 25 Vitest teszt, typecheck és production build sikeres; a lint sikeres, az öt korábbi React effect/dependency figyelmeztetés változatlan.
- [ ] Fizikai iPhone Safari érintési érzetét és EXIF-orientációs eszköztesztjét ez a környezet nem bizonyítja; ez továbbra is manuális QA.

- [x] BarcodeScanner keeps its video element mounted in an idle host, so the start action can request permission before activation. Start, detected-result delivery, explicit stop, close and unmount all release ZXing controls and media tracks; startup failures produce an actionable alert.
- [x] CameraCapture attaches the returned stream before marking the preview active, awaits Safari-compatible `video.play()`, uses the requested facing mode for camera switching, and detaches/stops every track on switch, capture, close and unmount.
- [x] Local barcode image processing now tries scaled, centered-crop, contrast and 90/180/270 degree orientation variants. Results are accepted only after EAN-8/EAN-13 checksum validation; unsuccessful recognition leaves the manual input available and never uploads the image.
- [x] Added deterministic EAN validation tests and Playwright camera tests with mocked streams, permission denial/retry, close/reopen cleanup, a known EAN-13 fixture, invalid-code fallback, Chromium and WebKit at 360x800, 375x812 and 390x844.
- [x] Frontend gates: Vitest `16 passed`, `typecheck`, production build, and `test:camera` `12 passed`. Lint exits successfully with the five pre-existing React effect/dependency warnings.
- [ ] Physical iPhone Safari camera permission and device autofocus remain manual QA; no real device or provider call was used by the deterministic browser tests.

## 2026-09-27 - Gemini 3.8 Flash adapter stabilization

- [x] The Gemini adapter defaults to `gemini-3.8-flash`; an optional `models/` prefix is normalized before building the endpoint. Gemini 3 requests set low thinking, while legacy models omit that field.
- [x] The prompt asks for at most three materially distinct suggestions, rejects spelling/language/package repetitions, and requires the exact `uncertain: ` prefix for uncertain ingredients.
- [x] The server parser also deduplicates names and ingredients, normalizes comparison keys, and raises the top-level uncertainty flag when an uncertain marker is present. Nutrient and calorie values remain forbidden.
- [x] The 500-token limit is now configurable through `VISION_MAX_OUTPUT_TOKENS`, with a 1024 default that leaves room for Gemini 3 thinking plus the short JSON response.
- [x] Mock regressions cover deduplication, uncertain ingredients, the Gemini 3 payload, and legacy-model compatibility. The single real call is an opt-in test using a generated 1x1 fixture.
- [ ] The local `.env` loaded no non-empty `GEMINI_API_KEY` in this run, so the real API smoke test skipped. After configuring the key locally, run `CHILL_RUN_LIVE_GEMINI=1` once.
- [x] Regression: targeted food-vision tests pass 7/7; backend passes 86 tests with 5 skips when the three known Windows ACL-blocked cache-import cases are excluded. The full run has the same three setup errors (87 passed, 5 skipped), which remain environmental.


## M19 - Gemini Food Vision stabilisation and mobile camera reliability (2026-09-27)

Status: IMPLEMENTED; live provider gate remains open because the single permitted live smoke test was blocked by the local TLS certificate chain.

- [x] The complete image flow was traced from file/camera selection through the frontend API, Railway gateway boundary, FastAPI endpoint and Gemini adapter. File selection keeps the source image locally, does not request camera permission, shows processing/success/error states, prevents parallel submissions, and offers retry or another image.
- [x] The backend returns stable structured error codes for disabled/unconfigured service, unsupported MIME, size limit, durable quota failures, provider rate limit, timeout, network/unavailable, authentication, bad request, invalid response and generic provider failure. The frontend maps these codes to Hungarian safe messages and never displays raw provider text.
- [x] Gemini 3.8 Flash remains the default model. The prompt and parser cap materially distinct suggestions at three, deduplicate names and ingredients, mark uncertain ingredients with `uncertain: `, and never infer nutrient values. `VISION_MAX_OUTPUT_TOKENS` is configurable and defaults to 1024.
- [x] Added Alembic revision `0010_vision_usage` and PostgreSQL-backed global, per-user and guest minute/daily counters with row locking and idempotent row creation. Guest subjects are HMAC digests of the directly observed client address; forwarded headers are not trusted. The local development database reached Alembic head without changing the SQLite source or production data.
- [x] Added backend provider/quota regressions, frontend API regressions, and Chromium/WebKit mobile tests at 360, 375 and 390 px. The full Playwright camera suite is 36/36; backend is 95 passed, 6 skipped; frontend unit is 27 passed; typecheck and production build pass; lint exits 0 with existing React warnings plus the initial-image synchronization warning.
- [ ] The isolated PostgreSQL quota test is skipped when `CHILL_TEST_DATABASE_URL` is not configured in the test environment. Run it against the dedicated test database before treating the PostgreSQL concurrency gate as independently proven.
- [ ] The one live Gemini smoke test was attempted with the locally configured key and failed before an HTTP response because the Windows environment rejected the remote TLS certificate (`CERTIFICATE_VERIFY_FAILED`). Do not disable certificate verification; rerun once the local CA chain is fixed.
- [ ] Railway staging verification and real iPhone camera/provider QA remain deployment/device gates. No deploy or push was performed.

## M19 pre-deploy verification update - 2026-09-27

- [x] The failing live smoke was reproduced without an API key or image upload diagnostic: the current elevated environment uses Python 3.13.15, OpenSSL 3.0.21, httpx 0.28.1 and certifi 2026.07.22. httpx/certifi rejects the remote certificate, while a context populated from the Windows ROOT store completes TLS 1.3 verification. TLS verification was never disabled.
- [x] Repository history contains no successful live result to reproduce: commit `64aae3d` documented the earlier run as skipped because no non-empty key was loaded. The current run differs by having a configured key, but it is blocked at local CA validation before an HTTP response.
- [x] The dedicated `CHILL_TEST_DATABASE_URL` database initially lacked `vision_usage`. Alembic `0010_vision_usage` was applied only there; `alembic current` reports `0010_vision_usage (head)`.
- [x] The isolated PostgreSQL durability/global-budget suite is now `2 passed`, including the parallel global-budget test. The full backend suite against the isolated test URL is `101 passed, 1 skipped, 2 warnings`.
- [ ] Live Gemini verification remains open until the local CA chain is configured. The safe remediation is environment trust configuration (an approved PEM bundle/system trust integration); do not set `verify=False` or commit a certificate/private key.

## M19 final Gemini integration gate - 2026-09-27

- [x] Added the `truststore` dependency and passed a verified system trust `SSLContext` to httpx. Certificate validation and hostname checking remain enabled; no insecure fallback exists.
- [x] The single real Gemini smoke test passed: TLS succeeded, the provider returned a valid response, the structured JSON was parsed, and the result contained at most three distinct food suggestions. The adapter contract still contains no nutrient fields and the prompt forbids nutrient estimation.
- [x] Full backend regression against the isolated PostgreSQL test database: `102 passed, 1 skipped, 2 warnings`; dependency check reports no broken requirements.
- [x] Added the M19 Railway staging checklist to `RAILWAY_STAGING.md`.
- [ ] Railway staging deployment and real device QA remain separate user-controlled gates. No push or deploy was performed.

## M19 magyar ételfelismerési eredmények - 2026-09-27

- [x] A Gemini promptja minden embernek szánt `name` és `possible_ingredients` értéket magyarul kér, miközben a JSON mezőnevek (`suggestions`, `name`, `confidence`, `possible_ingredients`, `uncertain`) változatlanok maradnak.
- [x] A stabil `uncertain: ` wire-marker megmaradt a backend kompatibilitásához. A frontend ezt strukturált `{ name, uncertain }` értékké alakítja, és természetes magyar jelzést jelenít meg; nyers marker és százalékos confidence nem látható.
- [x] A javaslat kiválasztása külön megerősítési lépésre került. Az étel neve és az összetevőlista helyben szerkeszthető, a megerősítés nem indít új Gemini-hívást és nem fogad el tápérték-becslést.
- [x] A backend prompt- és frontend API-regressziók, valamint a kamera E2E ellenőrzés lefedi a magyar tartalmat, a bizonytalanságot, a százalék elhagyását és a megerősítési folyamatot; a teljes Chromium/WebKit csomag 36/36 tesztje zöld.
- [x] A teljes backend-futtatás 98 tesztet teljesített; négy cache/import tesztet a Windows pytest-temp ACL blokkolt, miközben a módosított Vision-teszt 13/13 sikeres.


## M20 - CHill Chef MVP (2026-09-27)

### M20.1-M20.6 status: implemented; backend gate passed

- [x] Approved Vision suggestions now enter a local editable Chef workflow. Food name and ingredients can be renamed, removed, replaced, or added; uncertain rows remain visibly distinct and require individual confirmation.
- [x] Each ingredient reuses the existing search boundary: guest IndexedDB/custom foods, client cache, OFF and USDA results are grouped with source and CH. Results without verified CH are not selectable; a custom food requires user-entered CH per 100 g.
- [x] Quantities remain in grams and use parseAmountInput plus calculateCarbohydrate. Missing CH shows only an explicitly incomplete known subtotal; a checked total is never shown and saving is blocked.
- [x] A complete verified meal can be saved through the existing recipe API or guest IndexedDB, logged with local date/category, or added to the existing planner API/IndexedDB. Existing guest three-day rules remain unchanged.
- [x] Gemini output supplies no nutrient, gram, or estimate fields, and confirmation does not make another Gemini request.
- [x] calculation.test.ts covers valid zero CH, missing CH, and incomplete subtotals. A Chromium mobile E2E covers Vision -> source selection -> individual confirmation -> recipe and diary at 360, 375 and 390 px.
- [x] M20.5 ingredient photo mode reuses the existing Vision endpoint and quota boundary; confirmed ingredients also show up to three matching existing, verified recipes without a new AI call.
- [x] M20.6 mobile regression gate: the full Playwright suite is 48/48 in Chromium and WebKit at 360, 375 and 390 px.
- [x] Backend regression gate rerun against the isolated PostgreSQL test database: 106 passed, 1 skipped (opt-in live Gemini), 2 warnings. M20 backend behavior remains green.

## M21 - CHill Chef hűtőfelismerés és AI-receptgenerálás (2026-09-27)

### M21.1-M21.6 status: implemented; live/device gates remain open

- [x] M21.1: the existing CameraCapture and gallery input now support a local collection of up to four fridge photos. Adding, replacing and removing photos does not call Gemini; large images are downscaled locally before the explicit recognition action.
- [x] M21.2: `POST /api/vision/fridge` sends the selected images in one multipart request to the existing provider/quota boundary. The endpoint validates MIME/size/count, reserves one vision quota unit, keeps TLS and provider error handling, and returns Hungarian structured suggestions without nutrient or quantity fields.
- [x] M21.3: the frontend creates one editable fridge inventory, exact normalized names are merged conservatively, and uncertain rows remain visible. The user can add, rename, remove, split, explicitly merge and individually confirm items; no quantity is inferred or persisted.
- [x] M21.4: `POST /api/chef/recipes/generate` performs an explicit text-only Gemini request for up to three materially different Hungarian recipe ideas. The server validates required recipe fields, deduplicates names, bounds output, rejects incomplete responses and exposes no CH/nutrient estimates.
- [x] M21.5: selected suggestions hand off to the existing ChefWorkflow for catalog/custom-food matching, user quantities, deterministic CH, recipe save, diary/planner actions and guest storage. Missing recipe ingredients can be added to the existing shopping list with unknown quantity; no second catalog or CH engine was added.
- [x] M21.6: the workflow is staged and mobile responsive, preserves drafts while requests fail, blocks duplicate submits, and uses the existing visual language. No Alembic migration or database schema change was required.
- [x] Backend regression: isolated PostgreSQL suite `106 passed, 1 skipped, 2 warnings`.
- [x] Frontend regression: typecheck passed; Vitest `32 passed`; production build passed; lint exited 0 with existing Camera/App hook warnings.
- [x] Browser regression: Playwright Chromium and WebKit, 360/375/390 px, `54 passed` with mocked provider responses and local camera/image fixtures.
- [ ] A live Gemini call and physical iPhone verification were not repeated in this implementation turn. They remain explicit staging/device gates; no Railway deployment was performed.


## M22 – Mobile Product Polish / UI-UX stabilizálás (2026-09-28)

- [x] P1: üres CH/explicit nulla, Chef idempotens mentés és célzott retry, query-frissítés, draft-megőrzés, bizonytalanság, kézi leltár, naptári másnapi másolás és ismeretlen bevásárlómennyiség.
- [x] P2: közös mobil mező- és képernyőfejlécek, 44 px érintési célok, katalógus/receptek külön nézete, `aria-current`, kamera full-screen safe-area nézet és hűtőfotó csere.
- [x] M22 automatizált kapu: backend 100 passed/7 skipped; frontend unit 34 passed; typecheck/lint/build sikeres; Chromium/WebKit 56 passed; külön 360×667 vizuális ellenőrzés mindkét motorban.
- [ ] Fizikai iPhone Safari, élő provider smoke és Railway staging ellenőrzés továbbra is manuális/deployment kapu.

## M22.1 – Kritikus mobil kamera- és UI-regressziók (2026-09-28)

- [x] Az M22 előtti `05d417f` összehasonlítása igazolta, hogy a kameraréteg az add-sheet DOM-jában maradt, a barcode stream pedig a lookup eredménye előtt leállt.
- [x] A teljes képernyős kamera külön `#camera-root` portalba került, body scroll lockkal, safe-area és 360×667 viewport korlátokkal. Az aktív módban nincs ötelemű tablista.
- [x] Ismeretlen termék, hiányzó CH és lookup hiba után a scanner aktív marad; csak elfogadott találat vagy explicit életciklus-művelet állítja le.
- [x] A hűtőfotó UI egy képnél teljes szélességet, 2–4 képnél kéthasábos rácsot használ; a csere/törlés koordinátái a kártyán belül maradnak.
- [x] A helyi OCR változtatás nélkül megőrzi, jelzi és javításig nem engedi menteni a lehetetlen/ellentmondó tápértékeket, köztük a 159 g fehérjét és 149 g zsírt.
- [x] Frontend: 36 unit teszt, typecheck, lint és build sikeres. Playwright: 62/62 Chromium/WebKit teszt 360×667, 375×812, 390×844 méreteken, valódi ZXing EAN-8/EAN-13 dekódolással és vizuális/DOM-geometriai ellenőrzéssel.
- [x] Backend: 100 passed, 7 dokumentált skip, 1 warning.
- [ ] Fizikai iPhone Safari/PWA kameraengedély, autofókusz, orientáció és valós csomagolásos EAN továbbra is manuális eszközkapu. Élő provider, Railway, push és deploy nem futott.

Részletes eredmény: `docs/M22_1_CAMERA_REGRESSION_RESULT.md`.
