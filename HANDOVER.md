# Handover — M1.2 lezárva, M1.2.3 stabilizálás átadva

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a feltöltött dokumentáció szerinti lezárt történet. M1.3, M2, M3 és M4: **TODO**, ebben a dokumentációs munkában implementáció és új alkalmazásteszt nem történt. Következő feladat: **M1.3**, majd M2 → M3 → M4. A korábbi tesztszámok és élő eredmények történeti bizonyítékok, nem a mostani kód független ellenőrzései.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

## Jelenlegi állapot

Az M0, M0.1, M0.2, M1.1 és M1.2 lezárult. Az M1.2.3 stabilizálása elkészült, a konfiguráció betöltése kulcsérték megjelenítése nélkül igazolt, és a combined USDA/OFF integráció élő ellenőrzése sikeres: működő React/Vite frontend, CHill vizuális identitás, PWA build-infrastruktúra, Food domain, Open Food Facts + USDA provider, SQLite cache és FastAPI backend.

M0 státusz: DONE. M1.1 státusz: DONE. M1.2 státusz: DONE. M2 még nem indult el.

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
2. Futtass alapellenőrzést, mérd fel az aktuális SQLite-sémát/adatokat és a PostgreSQL-környezetet. M1.3 még TODO.
3. Készítsd el és igazold M1.3 összes kapuját, majd M2 → M3 → M4; tesztelt helyi commitokkal, folyamatos átadási jegyzettel.
4. Valódi Railway-deploy nincs engedélyezve ebben a scope-ban. A felhős hozzáférés hiánya nem akadálya az előkészítésnek; a helyi PostgreSQL-tesztek és valódi cache-import hiánya viszont nyitott M1.3 kapu.

Tervezési alapértékek: egy privát profil, Europe/Budapest időzóna rögzített helyi nappal; múltmegőrző nutrient-snapshot és hatálynapos cél; nincs kiosztott CH-keret. Ezek követelmények, nem meglévő funkciók. Részletes kapuk és kockázatok: TASKS.md, AGENTS.md, ARCHITECTURE.md.

Minden fejlesztési kör végén töltsd ki: aktuális mérföldkő/státusz; megvalósított változás; tényleges tesztparancsok/eredmények; importleltár és eltérések titokmentesen; commit hash; nyitott ellenőrzések; következő konkrét lépés. Ha elakadtál, pontosan mi hiányzik, és mi készült el ettől függetlenül.
