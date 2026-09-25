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
