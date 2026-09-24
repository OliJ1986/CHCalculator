# Mérföldkövek

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a feltöltött dokumentáció szerinti lezárt történet. M1.3, M2, M3 és M4: **TODO**, ebben a dokumentációs munkában implementáció és új alkalmazásteszt nem történt. Következő feladat: **M1.3**, majd M2 → M3 → M4. A korábbi tesztszámok és élő eredmények történeti bizonyítékok, nem a mostani kód független ellenőrzései.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

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
- [TODO] M1.3 — PostgreSQL, Alembic, biztonságos cache-adatátvitel és Railway-előkészítés
- [TODO] M2 — CH kalkulátor
- [TODO] M3 — Napi étkezési napló
- [TODO] M4 — CH célok és étkezések
- [TODO] M5 — Saját ételek, kedvencek és receptek
- [TODO] M6 — Vonalkód és OCR
- [TODO] M7 — AI funkciók

M0, M1.1 és M1.2 lezárva; M2 nem indult el. Az M1.2 élő USDA/OFF combined smoke-ja sikeres, a korlátozott retry és cache-fallback mellett a külső átmeneti hibák diagnosztizálhatók és izoláltan kezelhetők.

## Közös teljesítési kapu

A következő jelölőnégyzetek mind nyitottak. Egy mérföldkő csak akkor DONE, ha az összes kötelező elfogadási feltétel bizonyított. Részleges implementáció: IN PROGRESS; hiányzó környezet/ellenőrzés: BLOCKED vagy nyitott ellenőrzés, pontos indokkal. Az M1.3–M4 sorrend kötelező; sikertelen adatbiztonsági kapun nem lehet továbblépni.

- [ ] Induláskor a tényleges kód, Git-állapot, konfiguráció és meglévő tesztparancsok felmérése; alapellenőrzés. A történeti 40 backend/4 frontend teszt nem elvárt végső darabszám.
- [ ] Minden mérföldkőnél célzott regressziók, teljes backendteszt, frontend typecheck, lint, nem figyelő módban futó unit teszt és production build sikeres.
- [ ] Módosított UI: legalább 360 és 390 px szélességen, világos/sötét témában használható; billentyűzetfókusz, feliratok, hibák, érintési célok és vízszintes túlcsordulás ellenőrizve. Ha nincs böngészős QA, ez nyitott ellenőrzés marad.
- [ ] TASKS, HANDOVER, CHANGELOG és érintett architektúra/döntések frissítve; csak az adott munkához tartozó fájlokból érthető helyi commit. A commit hash és a tényleges teszteredmény az átadásban szerepel.

## M1.3 — PostgreSQL / Alembic / Railway-előkészítés [TODO]

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

- [ ] Tiszta dev PostgreSQL-en Alembic upgrade head sikeres, az ismételt futás nem változtat adatot; sémarevízió és ORM egyezése igazolt.
- [ ] Valódi, külön test PostgreSQL-en cache CRUD/upsert, source/source_id egyediség és keresési regressziók sikeresek. SQLite-only teszt nem igazolja ezt a kaput.
- [ ] Dry-run nem ír; import és ismételt import, konfliktus/hibás rekord, megszakítás és rollback tesztelve. A teljes rekord-összevetés sikeres; forrás és backup sértetlen.
- [ ] A tényleges helyi cache importja és dev PostgreSQL-ből visszaolvasása ellenőrzött; ha a forrás nem érhető el, ez nyitott marad, fixture nem helyettesíti.
- [ ] Dev/test/prod célok elkülönítése és veszélyes/azonos célokra adott elutasítás tesztelve, titkok nem jelennek meg a logban.
- [ ] Railway-előkészítés és helyi indítás ellenőrzött; a valós Railway-deploy külön, nem végrehajtott lépésként szerepel. Hiánya önmagában nem akadálya az előkészítési mérföldkő lezárásának.
- [ ] M1.2.3 regressziók megmaradnak. Élő USDA/OFF smoke külön eredményt kap: átmeneti szolgáltatói kiesés dokumentálható, ha a helyi PostgreSQL és offline regressziós kapuk sikeresek; nem állítható élő siker cache-es HTTP 200 alapján.

## M2 — Teljes CH-kalkulátor [TODO]

### Megvalósítás

- A meglévő keresés és kiválasztás bővítése; cache/USDA/OFF eredmények, magyar és eredeti név, márka, source/source_id és ételkategória megkülönböztethető. Eltérő FDC rekordok ne olvadjanak össze, új egységes alapanyag-katalógus nem része a scope-nak.
- Grammbevitel, meglévő gyorsgombok és +/- használata, azonnali újraszámítás. Magyar tizedesvessző és pont elfogadása egyértelmű normalizálással. Üres, nem véges, nem szám, nulla vagy negatív mennyiség nem menthető; a felső technikai határt és pontosságot dokumentáld és mindkét oldalon azonosan validáld.
- Változatlan képlet: amount_g × available_carbs_100g / 100. A valid 0 CH számolható; a NULL/hiányzó/ellentmondó CH nem nulla, és nem becsülhető. USDA rostlevonás csak a mapperben, OFF értékből nincs újabb rostlevonás.
- Számítás és összesítés kerekítetlen értékből; megjelenítés egy tizedes g, dokumentált és tesztelt kerekítéssel. A forrás pontossága maradjon meg. Keresési loading/üres/hiba, nem számolható találat, bevitelhiba és újrapróbálás érthető UI-t kapjon.
- M2 még nem ígér tartós naplót; ezt M3 biztosítja. A meglévő prototípus alapértékei nem felhasználói célok.

### Elfogadás

- [ ] 55 g és 11,4 g/100 g → 6,27 g belső érték, 6,3 g kijelzés; 100 g → a forrásérték; valid 0 CH → 0; törtmennyiség és vesszős input helyes.
- [ ] Negatív/0/üres/NaN/végtelen mennyiség és hiányzó CH esetén nincs érvényes eredményként mentés; a hiba kijavítása után helyreáll a flow.
- [ ] Gyorsgomb, kézi bevitel és ételváltás ugyanazt a determinisztikus számítást használja; nincs elavult eredmény vagy dupla rostlevonás.
- [ ] Azonos magyar nevű eltérő forrásrekordok azonosíthatók; relevancia/ranking és banánpaprika-regresszió változatlanul sikeres.
- [ ] Mobilon teljes keresés → kiválasztás → mennyiség → eredmény flow működik; közös teljesítési kapu teljesül.

## M3 — Tartós étkezési napló, tápanyag-pillanatképpel [TODO]

### Megvalósítás

- Alembic-migrációval naplómodell és PostgreSQL-tárolás; API létrehozás/listázás/szerkesztés/törlés/napi összesítés, frontend-integráció. A mock lista és mock összeg kikerül a valódi naplófolyamból, nem importálódik valós étkezésként.
- Tárolandó: bejegyzésazonosító, profilazonosító, elfogyasztás időpontja időzóna-adattal, rögzített helyi nap és IANA-időzóna, gramm, étkezési kulcs (M3-ban other), létrehozás/módosítás ideje, snapshot és számított CH. UTC időpont + rögzített helyi nap biztosítja, hogy későbbi eszköz-időzónaváltás ne sorolja át csendben a régi napokat. Alap időzóna Europe/Budapest, a profilban explicit rögzítve.
- Snapshot: magyar és eredeti ételnév, source/source_id, márka ha van, available_carbs_100g, rendelkezésre álló total/fiber és nutrient-provenance, mértékegység, mapping/calculation verzió és pillanatkép ideje. Hiányzó opcionális nutrient NULL marad. A cache-re mutató kapcsolat opcionális; cache-frissítés/törlés nem törölheti és nem módosíthatja a napló bizonyító adatait.
- A szerver ellenőrzi a kiválasztott élelmiszer adatait, készíti a snapshotot és számítja a CH-t; kliens által beküldött összegben nem bízik. Az M2-ben látott és mentéskor elérhető nutrient eltérése esetén ne mentsen észrevétlenül más értéket: frissített előnézet és új mentés szükséges.
- Mennyiség szerkesztése az eredeti snapshotból számol újra; dátum/kategória módosítása nem frissít nutrientet. Explicit ételcsere új snapshotot készít. Providerkieséskor a már naplózott adatok megtekintése és mennyiségszerkesztése tovább működik.
- Sikeres szervermentés után frissüljön a napi összeg. Sikertelen kérés ne jelenjen meg tartós mentésként; függő mentés alatt dupla kattintás tiltva, újrapróbálásnál idempotenciakulcs védjen a duplikálástól. Törlés előtt felhasználói megerősítés; tranzakciós írás és következetes szerverválasz.
- M1.3–M4 alap scope: egy privát, egyfelhasználós profil, nem teljes auth-rendszer. A profil a szerveren kijelölt, nem tetszőleges kliens-ID. Auth nélküli napló nem publikálható nyilvános internetre; Railway-előkészítéshez ezt korlátozásként dokumentáld, publikus/multifelhasználós kiadás előtt külön hozzáférésvédelmi döntés kell.

### Elfogadás

- [ ] Hozzáadás, listázás, dátumváltás, mennyiség/étel/időpont szerkesztése és törlés integrációs tesztje valódi test PostgreSQL-en sikeres.
- [ ] Oldalfrissítés és backend-újraindítás után minden mentett bejegyzés és összeg visszaolvasható; üres nap összege 0.
- [ ] Cache nutrient/name változtatása vagy cache-rekord törlése után a meglévő bejegyzés snapshotja és CH-ja változatlan. 55 g × 11,4/100 = 6,27; későbbi cache=20 mellett 100 g-ra szerkesztve a régi snapshotból 11,4 g marad.
- [ ] Napi összeg kerekítetlen bejegyzésértékek összege; csak a végső kijelzés kerekített. Éjfél, napváltás, Europe/Budapest nyári/téli időszámítás és időzónaváltás tesztelt; kétértelmű helyi időhöz offset szükséges, nem létező idő elutasítandó.
- [ ] Dupla küldés/timeout utáni retry nem hoz létre két sort; sikertelen mentés nem módosítja a tartós összesítőt. Szerver elutasít hamis CH-t és nem megengedett profilhoz tartozó műveletet.
- [ ] Offline/szerverhiba érthetően jelzett, nincs hamis „mentve” állapot. PWA nem cache-el privát napló API-választ általános cache-first szabállyal; teljes offline szinkron nem része M3-nak.
- [ ] Közös teljesítési kapu teljesül, a 84/160 mock állapot nem látszik valós adatként.

## M4 — Felhasználói CH-célok és étkezések [TODO]

### Megvalósítás

- Felhasználó által megadott, tartós napi CH-cél; nincs automatikusan kiosztott 160 g vagy orvosi ajánlás. A hiányzó cél külön állapot, összeg továbbra is látható. Pozitív véges grammérték szükséges; 0/negatív/nem szám elutasítandó. A cél törlése „nincs cél” állapotot jelent, nem 0-val osztást.
- Stabil kulcsok és magyar címkék: breakfast/reggeli, morning_snack/tízórai, lunch/ebéd, afternoon_snack/uzsonna, dinner/vacsora, other/egyéb. Ezek az étkezési kategóriák különböznek a Food ingredient/processed/packaged/other osztályozásától. Korábbi M3-bejegyzések other értéket kapnak; felhasználó módosíthatja, automatikus időalapú átsorolás nincs.
- Opcionális pozitív cél étkezésenként. Hiányzó rész-cél nem 0. A rész-célok összege eltérhet a napi céltól; a UI jelezze az eltérést, de ne ossza át vagy írja felül a felhasználó értékeit. Napi cél hiányában rész-cél is megadható, a napi százalék ilyenkor nem számolható.
- Napra érvényes célverziók: új napi/rész-cél alapértelmezetten a kiválasztott helyi naptól érvényes a következő verzióig; korábbi napok változatlanok. Múltbeli hatály megadása explicit, látható művelet. Az adott naphoz a legutolsó nem későbbi célverzió tartozik; cél nélkül maradt régi napnak nincs kitalált célja. Egy profil/hatálynap egy egyértelmű verzió; napi és rész-cél mentése atomikus.
- Elfogyasztott CH a napló snapshot-összege; maradék = cél − elfogyasztott, negatív érték helyett/ mellett egyértelmű „túllépés X g”. A progress sáv vizuálisan 0–100%-ra korlátozott, az adatból számolt arány 100% fölé is mehet. Nincs cél esetén nincs százalék/sávval sugallt cél. A korábbi vizuális döntés szerint külön százalék-kijelző nem szükséges.

### Elfogadás

- [ ] Napi cél és opcionális rész-célok mentés, újratöltés és backend-újraindítás után megmaradnak; hiányzó, törölt, 0, negatív és hibás érték kezelése tesztelt.
- [ ] 160 g cél, 84 g fogyasztás → 76 g maradék, belső arány 52,5%; 175 g → 15 g túllépés, sáv legfeljebb 100%. Cél nélkül nincs osztás és nincs alapértelmezett 160 g.
- [ ] Minden kategória részösszege együtt pontosan a napi összeg; hozzáadás, törlés, mennyiség- és kategóriaváltás azonnal konzisztens eredményt ad.
- [ ] Mai célszerkesztés nem írja át a tegnapit; cél előtti nap, jövőbeli hatály, explicit múltbeli módosítás és cél törlésének hatálya tesztelt.
- [ ] Rész-célok összege napi céltól eltérhet, erről semleges jelzés látszik; nincs automatikus étrendi számítás vagy keretmódosítás.
- [ ] Korábbi napok nézete és mobil UI működik; minden közös kapu teljesül. M4 után autonóm fejlesztés megáll; M5–M7 és katalógus nincs implementálva.
