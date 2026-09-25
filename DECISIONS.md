# Döntési napló

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3, M2 és M3: **DONE**, a valódi PostgreSQL-, kalkulátor- és snapshot-napló kapu sikeres. M4: **DONE**, a hatálynapos cél- és kategóriakapuk bizonyítottak.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

- React + TypeScript + Vite: gyors, valódi SPA/PWA alap és egyszerű deploy.
- Next.js és Flutter elvetve: nem illeszkednek a kért frontend stackhez.
- PWA-first: a mobilon telepíthető élmény már M0-ban látható.
- FastAPI backend: minimális, jól bővíthető Python HTTP réteg.
- Frontend/backend szétválasztva: UI-prototípus és későbbi adat/API fejlesztés egymástól független.
- SQLite fejlesztéshez, SQLAlchemy 2.x engine: PostgreSQL-kompatibilis adatbázisréteg.
- Determinisztikus CH-számítás: AI nem lehet a végleges CH-érték forrása.
- Mobil-first UX: a legfontosabb flow egy kézzel, bottom sheetből elvégezhető.
- Light alapértelmezett és külön tervezett dark theme: a téma nem puszta színinvertálás.
- Vizuális minőség elsőrangú: egyedi szín-, spacing- és felületrendszer, kevés kártya, visszafogott CSS motion.
- Egyszerűség a funkciógazdagság előtt: M0 nem tartalmaz előre gyártott, üres domain-rendszereket.
- M0.1 brand: a végleges user-facing név CHill; a belső `frontend` package név változatlan marad.
- M0.1 vizuális irány: Fresh Premium, meleg neutrális háttérrel, korall primaryvel, pisztácia progress accenttel és grafit/padlizsán daily surface-szel.
- M0.1 hero: egyetlen domináns vízszintes progress bar marad; a progress ring és százalék kijelzés redundancia miatt kikerült.
- M0.1 ikonok: az emoji alapú ételvizuált egységes, lokális line icon rendszer váltja fel.
- M0.1 mozgás: a meglévő egyszerű CSS animation/transition réteg marad; új animation library nem kerül be.
- M0.2 cleanup: a funkció nélküli motivációs filler kártya kikerül; a felület nem beszél többet a szükségesnél.
- M0.2 hierarchia: a daily hero sorrendje aktuális CH → maradék CH → napi keret → progress; új vizuális mérőelem nem kerül be.
- M0.2 desktop shell: a mobil app középre zárt, enyhén keretezett surface marad; nincs külön desktop dashboard, sidebar vagy kétoszlopos layout.
- M1.1 belső Food domain: az OFF mezők nem kerülnek a frontendbe; a stabil CHill mező `available_carbs_100g`, az invalid érték pedig nem számolható `None` marad.
- M1.1 provider: az OFF teljes szöveges kereséshez a dokumentált `cgi/search.pl` végpontot használjuk, mert az OFF v2/v3 strukturált keresése nem általános full-text keresés; barcode lekéréshez az aktuális v3 product endpointot használjuk.
- M1.1 cache: SQLite-ben source/source_id egyediséggel, egyszerű cache-first kereséssel és minimális `source_payload` megőrzéssel deduplikálunk.
- M1.1 adatforrás/licenc: Open Food Facts adatokat használunk. Publikus termékkiadás előtt az ODbL licencből fakadó cache/persistence és attribution követelményeket külön felül kell vizsgálni; ez technikai kockázati feljegyzés, nem jogi értelmezés.
- M1.2 USDA: a `USDA_API_KEY` csak backend configból érkezhet; kulcs nélküli környezetben a USDA provider üres eredménnyel, logolt unavailable állapottal működik tovább, az OFF ettől független marad.
- M1.2 CH mapping: a USDA stabil nutrient ID 1005 (total carbohydrate) és 1079 (dietary fiber) mezőiből csak akkor készül `total - fiber`, ha mindkét érték érvényes és a fiber nem nagyobb a total értéknél; hiányzó vagy ellentmondó adatokból nincs automatikus becslés.
- M1.2 alias/ranking (kezdeti megoldás): a kicsi magyar alias lista normalizált lookupot használ; a generikus USDA data type-ok és az exact márkás OFF találatok külön preferenciát kaptak.
- M1.2 USDA licenc: FoodData Central adatainak CC0 1.0 licencét használjuk; a forrás megjelölése ajánlott, user-facing attribution későbbi polish lehet.
- M1.2 integrációs újranyitás: a korábbi DONE jelölés visszakerült IN PROGRESS állapotba, mert a manuális combined smoke még nem igazolta, hogy az USDA valóban bekerül az aggregált válaszba. A lezárás valódi, konfigurált USDA kulcsos smoke-hoz kötött.
- M1.2 diagnosztika: az `.env` útvonala a backend modul helyéhez kötött, nem a process working directoryjához; a log csak configured állapotot, provider countokat és USDA raw/mapped/invalid CH countokat tartalmaz. A hiányzó search nutrientek details fallbackje top-3 budgettel korlátozott.
- M1.2.1 keresési szándék: egyetlen ismert magyar alapanyagalias egyszerű keresésnek számít; több lényeges token vagy márka/termékkifejezés összetett keresés. A pontozás név-, alias-, összes-token-, kategória- és márkatalálatokat használ, adatforrás szerinti automatikus előnyt nem.
- M1.2.1 kategorizálás: a domain a `ingredient`, `processed`, `packaged`, `other` stabil kulcsokat használja, a frontend magyar címkéket kap. Hiányos termékadat esetén `other` marad; az USDA és OFF eredeti neve külön `original_name` mezőben őrződik.
- M1.2.1 cache-kompatibilitás: az új `original_name` és `category` mezők SQLite-ban additív induló migrációval kerülnek be, így a meglévő fejlesztési cache tovább használható.
- M1.2.1 összetett magyar lekérdezések: csak a kis, kézzel karbantartott generikus token-szótár fordít provider-query kifejezéseket (például `banános joghurt` → `banana yogurt`); márkanevek és kereskedelmi terméknevek változatlanok maradnak.
- M1.2.1 rangsorolási pontosítás: a kezdeti source-alapú preferencia helyett a közös kategória-, név-, token- és márkarelevancia dönt; az USDA önmagában nem kap automatikus pontelőnyt.
- M1.2.2 USDA névleképezés: a magyar címke csak akkor készül, ha az eredeti forrásnév ténylegesen az alias alapanyagával kezdődik; a `Pepper, banana, raw` ezért nem lesz „Banán, nyers”. A túlérett, aszalt és banana pepper változatok kézi megkülönböztető címkét kapnak, az eredeti angol név pedig másodlagos UI-szövegként megmarad.
- M1.2.2 nutrient-provenance: az USDA payload a data type, FDC-leírás, a felhasznált nutrient ID-k és a nyers 100 g-os nutrient-értékek diagnosztikai metaadatait is megőrzi; a CH-számítás ettől nem változik.
- M1.2.2 cache-verziózás: az USDA megjelenítési és kategorizálási szabályainak módosítása a `USDA_MAPPING_VERSION` értékével célzottan migrálja a régi USDA cache-sorokat, rekordtörlés nélkül.
- M1.2 végső rangsorolási pontosítás: az egyszerű alias alapanyag-bónusza vesszővel tagolt és többes számú forrásneveket is felismer; a `banana pepper` forrásnév külön ételként kimarad a sima banán-bónuszból.
- M1.2 élő validáció: a konfigurációs kulcs jelenléte igazolt, de intermittáló USDA 400-as és OFF provider-hibák miatt a cache-fallback bizonyított, a külső combined integráció viszont nyitva marad.
- M1.2.3 USDA kérésforma: a `/foods/search` keresés POST JSON törzset használ, amely a `dataType` szűrőt tömbként küldi; a korábbi ismételt `dataType` query-paraméterezés HTTP 400-at okozott. A részletes `/food/{fdcId}` lekérés GET marad.
- M1.2.3 provider hibakezelés: a 429, 5xx, timeout és hálózati hibák legfeljebb korlátozott, exponenciális késleltetésű retry-t kapnak; 400-as és 401/403 hitelesítési hibák változatlan kérésre nem próbálkoznak újra. Az OFF keresési query normalizált formában megy ki.
- M1.2.3 diagnosztika és izoláció: a közös HTTP-réteg forrást, request type-ot, metódust, queryt, státuszt, hibatípust, válaszidőt és retry állapotot naplóz URL és titkos paraméterek nélkül; a FoodService külön cache-, friss USDA- és friss OFF-számlálót vezet, és egyik provider hibája sem szakítja meg a másik eredményét.
- M1.2 lezárás: a hat keresésből álló, konfigurált élő combined smoke mind 200-as választ és a lezáró futásban végső provider-hiba nélküli eredményt adott; az időszakos OFF 503 válaszok retry-vel helyreálló szolgáltatói korlátozásként dokumentáltak.

## 2026-09-24 — M1.3–M4 tervezési döntések (elfogadott irány; implementáció TODO)

- D1: a korábbi „SQLite fejlesztéshez” döntést M1.3-tól PostgreSQL váltja. Ok: azonos dev/prod motor a tervezett Railway-környezethez. SQLAlchemy marad, a régi SQLite és backup megőrzendő; külön dev/test/prod adatbázis kötelező.
- D2: Alembic kezeli a sémát, explicit migrációs lépésben. Nem az alkalmazásindulás ad hoc DDL-je. A mapping_version ettől külön, adatleképezési verzió marad.
- D3: SQLite cache-adatátvitel dry-run, backup, idempotencia, konfliktusnál rollback és teljes rekordellenőrzés mellett. Import nem számít újra nutrientet, és nem töröl forrásadatot. A történeti 123 rekord nem új migrációs elvárás.
- D4: M1.3 Railway-előkészítés, nem éles deploy. Valós felhős létrehozás, fizetős művelet és prod adatírás külön felhasználói felhatalmazást igényel.
- D5: M2 a meglévő determinisztikus CH-szabály és relevancia-rangsor bővítése. Nincs forrás szerinti új preferencia, becsült nutrient vagy külön katalógusrendszer.
- D6: M3 tartós napló snapshotot őriz, nem csak Food idegen kulcsot. Korábbi étkezés cache-frissítéstől/törléstől független; mennyiség szerkesztése régi snapshotból, explicit ételcsere új snapshotból számol.
- D7: időpont UTC-ben, helyi nap és IANA-időzóna külön rögzítve; kezdeti privát profil Europe/Budapest. Régi napok nem csoportosulnak át csendben az eszköz időzónájával.
- D8: egy privát profil a scope, teljes auth/multitenancy külön munka. Auth nélküli személyes napló nem kerül nyilvános Railway-deployba.
- D9: M4 céljai kizárólag felhasználói értékek, hatálynap szerint verziózva. Nincs automatikus 160 g cél. Nincs cél ≠ nulla; a rész-célok eltérhetnek a napi céltól, jelzéssel, automatikus átírás nélkül.
- D10: étkezési kategória külön domain a Food kategóriától. Meglévő naplósorok other/egyéb értékre kerülnek, nem találgatott étkezésre.
- D11: autonóm sorrend M1.3 → M2 → M3 → M4; kötelező tesztkapuk és helyi commitok. M5–M7, teljes offline szinkron, új katalógus nem része. Az apró technikai döntéseket az agent önállóan hozza és dokumentálja.

## 2026-09-24 — M1.3 megvalósítási állapot

- D12: a `DATABASE_URL` explicit környezetválasztó. Dev/test esetén a történeti backend SQLite cache csak lokális kompatibilitási fallback; prodban hiányzó URL hibát ad, és PostgreSQL-környezetben az alkalmazás nem futtat `create_all`/ad hoc DDL-t.
- D13: az Alembic `0001_initial_foods` az első PostgreSQL-sémaforrás. A `mapping_version` továbbra is adatleképezési verzió, nem Alembic-revízió; az alkalmazásindítás és a migráció szétválasztott.
- D14: a SQLite-import kizárólag explicit dev/test célba írhat. A forrás read-only, backup API-s másolatból auditálható, alapértelmezett dry-run, teljes canonical rekord- és nutrient-egyezés szükséges, konfliktus esetén nincs felülírás és tranzakciós rollback történik.
- D15: Railway csak konfigurációs/pre-deploy előkészítés (`railway.toml`, Alembic upgrade head, healthcheck); valódi szolgáltatás, fizetős erőforrás, prod adatbázis vagy deploy nem készül.
- D16: M1.3 státusza BLOCKED marad, amíg nincs izolált, valódi PostgreSQL test DB. A helyi gépen nincs PostgreSQL-szerver, Docker, `psql` vagy `CHILL_TEST_DATABASE_URL`; az offline Alembic és SQLite-fixture tesztek nem helyettesítik ezt a kaput.

## 2026-09-25 — M1.3 lezárási döntések

- D17: A megőrzött SQLite cache timezone nélküli időbélyegeit UTC-ként kell értelmezni az importban, mert a korábbi alkalmazási írás UTC-ben készült. Az import ezt UTC-aware értékként adja át PostgreSQL-nek, a teljes rekord-összehasonlítás pedig UTC-re normalizálja a timezone-ábrázolást; a forrás canonical digest-formátuma változatlan marad.
- D18: Az Alembic `fileConfig` hívása `disable_existing_loggers=False` beállítással fut. Az integrációs migráció nem tilthatja le az alkalmazási/provider diagnosztikai loggereket, mert azok a migrációt követő folyamatban is szükségesek.
- D19: M1.3 csak a külön `chill_dev` és `chill_test` helyi PostgreSQL-kapuk sikeres bizonyítása után zárható le. A `chill_dev` kapja a 341 rekordos importot; a `chill_test` kizárólag izolált CRUD, dry-run és rollback ellenőrzések célja marad.

## 2026-09-25 — M2 kalkulátor döntései

- D20: A CH-kalkulátor érvényes mennyisége 0-nál nagyobb, véges és legfeljebb 100 000 g; az elérhető CH 0 és 100 g/100 g közötti véges érték, a hiányzó CH nem számolható. A backend és frontend ugyanazt a szabályt alkalmazza.
- D21: A belső CH-számítás kerekítés nélkül az `amount_g × available_carbs_100g / 100` képlettel történik; egy tizedesre kerekítés kizárólag megjelenítési művelet. A valid 0 CH megmarad 0-ként.
- D22: A M2 számítási endpoint (`POST /api/carbs/calculate`) nem tartós napló; M3 felelőssége lesz a szerveroldali snapshot és mentés. A prototípus napi lista továbbra sem tekinthető tartós felhasználói adatnak.

A korábbi IN PROGRESS és integrációs újranyitási bejegyzések megőrzött történeti állapotok; az M1.2.3 lezárás nem kerül visszavonásra pusztán a dokumentáció újratervezése miatt.

## 2026-09-25 — M3 megvalósítási döntések

- D23: A tartós napló külön `MealEntry` snapshotot tárol. A `Food` kapcsolat opcionális és `SET NULL`, ezért cache-frissítés vagy törlés nem írhatja át a korábban számolt CH-t és eredeti neveket.
- D24: A profil az M3–M4 scope-ban szerver által kiválasztott `default-profile`; kliens nem adhat meg tetszőleges profilazonosítót. Nyilvános, többfelhasználós kiadás előtt külön auth-döntés szükséges.
- D25: A kliens előnézeti CH-ja csak konzisztencia-ellenőrzésre szolgál. A mentett értéket a szerver a snapshotból számolja, az idempotencia-kulcs pedig ugyanazon kérés ismétlését egyetlen rekordra korlátozza.
- D26: Az explicit offset nélküli `consumed_at` érték elutasított. A UTC pillanat, a rögzített IANA-zóna és a helyi nap együtt kezeli a DST/éjfél eseteket és megőrzi a történeti napbesorolást.


## 2026-09-25 — M4 megvalósítási döntések

- D27: A célverzió kulcsa `(profile_id, effective_date)`. A nap mindig a legutolsó, nem későbbi verziót örökli; múltbeli írás csak explicit `allow_past` kéréssel engedélyezett.
- D28: A hat étkezési kategória stabil angol kulcsot és magyar címkét kap, és független a Food domain-kategóriáitól. A korábbi M3 rekordok `other` értéke megmarad, automatikus átsorolás nincs.
- D29: A cél nélküli és a nulla cél különbözik. Az üres PUT tombstone-verziót tárol; a rész-célok összege eltérhet a napi céltól, ezt a UI semleges tájékoztatással jelzi, automatikus újraosztás nélkül.
- D30: A múltbeli napló CH-ja kizárólag a MealEntry snapshotból számítódik. A cél- és kategóriamutáció nem ír át korábbi étkezési snapshotot, csak az adott nap összesítő nézetét változtatja.
