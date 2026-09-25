# Coding agent irányelvek

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**, M5: **IN PROGRESS** (a kód és automatizált kapuk elkészültek, a böngészős UI-kapu nyitott); M6–M7 további scope.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

Módosítás előtt kötelező elolvasni: `PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `TASKS.md`, `HANDOVER.md`.

- A meglévő architektúrát indok nélkül ne cseréld le.
- Fontos döntéseket dokumentálj; jelentős munka után frissítsd a `TASKS.md` és `HANDOVER.md` fájlokat.
- User-visible változás után frissítsd a `CHANGELOG.md`-t.
- Az egyszerű, kis és érthető megoldást részesítsd előnyben.
- Ne készíts spekulatív absztrakciót vagy későbbi funkciót idő előtt.
- A vizuális minőség és a mobil használhatóság nem opcionális.
- A CH-számítás maradjon determinisztikus és tesztelt.

## Autonóm fejlesztés M1.3-tól M5-ig

1. Olvasd el mind a nyolc dokumentumot, majd ellenőrizd a kódot, Git-státuszt és rendelkezésre álló futtatókörnyezetet. A TASKS részletes kapui az aktuális terv; lezárt M1.2.3 történetet ne írj át és ne futtasd újra fejlesztési feladatként. Valós regressziót természetesen javíts és dokumentálj.
2. Haladj M1.3 → M2 → M3 → M4 → M5 sorrendben; ne állj meg pusztán egy részfeladat vagy mérföldkő végén. Rutin kódmódosításhoz, új releváns teszthez, helyi fejlesztési migrációhoz és commitokhoz nem kell ismételt engedély. A scope-on belüli technikai döntéseket önállóan, kis változtatásokkal hozd meg.
3. Először ellenőrizd a meglévő változtatásokat. Ne töröld, reseteld vagy commitold más munkáját; dirty fájlnál őrizd meg a felhasználói részeket. Destruktív Git reset/clean, force push és előzményátírás tilos. Logikus, tesztelt egységenként készíts helyi commitot explicit fájllistával; push/merge/release nincs a feladatban. Git-identitást ne találj ki.
4. A SQLite-forrás és backup sérthetetlen. Migrációt csak ellenőrzött dev/test célon futtass a TASKS szerint. Tesztből soha ne legyen prod/dev adatbázis-takarítás. Éles adatírás, forrástörlés, destruktív sémamódosítás, valós Railway-deploy és fizetős infrastruktúra külön döntést igényel; az előkészítő kódot és teszteket addig készítsd el.
5. Titok nem kerülhet Gitbe, terminálkimenetbe, logba vagy átadásba. .env tartalmát ne jelenítsd meg és ne írd felül; szükséges konfigurációt célzottan, értékkiírás nélkül ellenőrizz. Példakonfigurációba csak helyőrző kerüljön. Adatbázisdump, valódi naplóadat és cache-backup ne kerüljön commitba.
6. Determinisztikus CH, snapshot, NULL/0 különbség, forrásazonosság és múltbeli célok sértetlensége kötelező. UI-ból kapott CH-t ne fogadj el ellenőrizetlenül. Orvosi ajánlást, új AI-t vagy kitalált tápanyagot ne adj hozzá.
7. Tesztelj a tényleges repóparancsokkal. Minden mérföldkőnél teljes backend, frontend typecheck/lint/unit/build és célzott integráció; DB-viselkedéshez valódi izolált PostgreSQL szükséges. Külső API nélküli regressziók determinisztikus fixture-ökkel fussanak; élő smoke külön, korlátozott hívásszámmal és cache/friss számlálókkal. Ellenőrzést ne kerülj meg és tesztet ne gyengíts a zöld eredményért.
8. Szolgáltatói átmeneti kiesést különíts el implementációs hibától. Dokumentálva folytatható a tőle független munka, de a nem futott teszt nem sikeres. PostgreSQL-/adatmegőrzési kapu hiányában a következő mérföldkőre nem lehet késznek tekintett M1.3-mal továbblépni.
9. Haladáskor frissíts TASKS/HANDOVER-t; csak tényleges funkcióváltozást írj elkészültként a CHANGELOG-ba. Rögzítsd a futtatott ellenőrzést, eredményt, ismert hibát és következő lépést. Ne írj új DONE státuszt bizonyíték nélkül.
10. Blokkoló esetén vizsgáld meg az okot, próbálj érdemben eltérő, biztonságos javítást, kerüld ugyanannak végtelen ismétlését. Hiányzó jogosultság/titok/PostgreSQL esetén végezd el a független előkészítést, majd adj pontos akadályt és minimális szükséges felhasználói lépést. A biztonsági határt ne kerüld meg.

### Leállási feltételek

- M5 minden kötelező kapuja sikeres: végső átadás, teszteredmények, commitok, korlátozások; M6-ba ne kezdj.
- Adatvesztés veszélye, importeltérés, ismeretlen megőrzendő adat, prod cél vagy nem engedélyezett külső/fizetős művelet: az érintett művelet előtt állj meg; biztonságos előkészítés folytatható.
- Feloldhatatlan környezeti/jogosultsági hiba vagy termékscope-ot megváltoztató döntés: ne találgass, kérj konkrét feloldást az elvégzett munka átadásával.
- Munkamenet/erőforrás korlát: hagyj pontos HANDOVER-t a félkész állapotról és folytatási parancsokról; nem kész funkciót ne jelölj késznek és hibás munkát ne minősíts tesztelt commitnak.
