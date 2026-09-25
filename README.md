# CHill

## Aktuális tervezési állapot — 2026-09-25

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3–M4: **DONE**; M5 és M8–M11 kódja és automatizált kapui elkészültek, de a böngészős UI-kapu miatt **IN PROGRESS**.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M5 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

Mobil-first szénhidrátszámláló PWA prototípus. A CHill célja egy gyors, egyszerű és vizuálisan karakteres napi CH-áttekintő.

A Receptek nézetben profilhoz kötött saját ételek és receptek kezelhetők; a Kedvencek nézet a napi tervezőt és a bevásárlólistát tartalmazza. Vendég módban ezek az adatok az eszköz IndexedDB-jében maradnak, bejelentkezve PostgreSQL profiladatként tárolódnak.

## Stack

React, TypeScript, Vite, TanStack Query, React Router, CSS transitionök, saját manifest/service worker PWA-alap; backendként FastAPI, SQLAlchemy 2.x, Pydantic Settings és PostgreSQL. A megőrzött SQLite csak az M1.3 cache-import forrása.

## Előfeltételek

Node.js + npm, valamint Python 3.11+ és a repóban lévő `.venv`. PowerShell execution policy esetén az npm parancsokhoz `npm.cmd` használandó.

## Telepítés és fejlesztés

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Másik terminálban:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

USDA generikus kereséshez másold a példakonfigurációt, majd töltsd ki a saját kulcsoddal:

```powershell
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# az USDA_API_KEY értékét csak a backend/.env fájlban add meg
```

API key nélkül az USDA provider kulturáltan unavailable marad, az Open Food Facts keresés továbbra is működik. A kulcs nem kerülhet frontendbe, forráskódba vagy dokumentációba.

Health check: `http://127.0.0.1:8000/api/health`.

## Build és tesztek

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build

cd ..\backend
..\.venv\Scripts\python.exe -m pytest
```

## Repository struktúra

```text
frontend/   React/Vite/PWA kliens, API adapter és CH domain teszt
backend/    FastAPI, Food domain/provider/cache, SQLAlchemy engine és tesztek
PROJECT.md  termék- és scope memória
ARCHITECTURE.md  gyakorlati architektúra
DECISIONS.md  döntési napló
TASKS.md  mérföldkövek
HANDOVER.md  folytatáshoz szükséges állapot
CHANGELOG.md  user-visible változások
AGENTS.md  jövőbeni coding agent szabályok
```

## M1.3 ellenőrzött állapot és következő fejlesztés

A fenti futtatóparancsok az M1.2.3 alap flow-ját mutatják. M1.3 helyi PostgreSQL-kapui lezárultak: `chill_dev` és `chill_test` külön cél, Alembic migráció, 341 rekordos import, teljes visszaolvasási egyezés, idempotencia és rollback sikeres.

Az ellenőrzött M1.3 lépések: helyi PostgreSQL indítása → külön dev/test DB létrehozása → helyi, titkos `DATABASE_URL` és `CHILL_TEST_DATABASE_URL` konfigurálása → Alembic `upgrade head` → SQLite backup/dry-run/import/ellenőrzés → backend regresszió. Az M2 kalkulátor ezután bevezette a közös mennyiség- és CH-validációt, a `POST /api/carbs/calculate` végpontot és a mobil mennyiségi flow-t. Ne írd felül a meglévő `.env`-et; a példában csak helyőrzők legyenek. A prod Railway DB nem helyi fejlesztési cél. A következő mérföldkő az M3 tartós napló.

Az elkészült import eszköz alapértelmezésben dry-run:

```powershell
cd backend
python -m app.tools.cache_import --source chill.db --target-env DATABASE_URL --environment dev
python -m app.tools.cache_import --source chill.db --target-env DATABASE_URL --environment dev --write
```

Az import csak PostgreSQL dev/test célba írhat; a `DATABASE_URL` értéke nem kerül naplózásra. A tényleges PostgreSQL-kapuhoz külön `chill_test` adatbázis és `CHILL_TEST_DATABASE_URL` szükséges.

Railway-re külön backend és PostgreSQL szolgáltatás készül elő, dokumentált pre-deploy migrációval, PORT/healthcheck/CORS és frontend API-címmel. Valós deploy és éles adatátvitel külön feladat. Auth nélküli étkezési napló nem tehető nyilvánossá.

Az M3 tartós snapshot-napló és M4 hatálynapos saját célok részletes követelménye a TASKS.md-ben van. A nyolc dokumentum mellé adott CODEX_PROMPT.md indítja az autonóm megvalósítást; ez a csomag dokumentáció, nem már elkészült alkalmazásfrissítés.

## M3 ellenőrzött állapot

Az M3 a mock napi listát valódi `/api/meals` CRUD-ra cseréli. Az Alembic `0002_meal_log_snapshot` profil- és naplósémát ad; a szerver UTC időpontot, rögzített helyi napot és IANA-zónát tárol, a tápanyag-pillanatképből számol, és idempotencia-kulccsal védi az ismételt küldést. A cache későbbi módosítása nem változtatja meg a mentett snapshotot. A `chill_test` PostgreSQL-integráció és a 66 backend teszt sikeres; a frontend mobil QA 390 és 360 px-en túlcsordulás nélkül zöld.


## M4 ellenőrzött állapot

Az M4 a `0003_goal_versions` migrációval tartós, hatálynapos felhasználói napi és opcionális étkezési célokat vezetett be. A hat kategória (`reggeli`, `tízórai`, `ebéd`, `uzsonna`, `vacsora`, `egyéb`) részösszege a mentett napló-snapshotokból készül; hiányzó cél esetén nincs százalék vagy implicit 160 g. A mobil felület dátumot vált, korábbi célhoz megerősítést kér, és 390/360 px-en túlcsordulás nélkül működik.

A teljes M4 ellenőrzés: backend `70 passed, 2 warnings` valódi PostgreSQL-lel, frontend typecheck/lint/7 unit teszt/build, valamint cél- és kategória-interakciós mobil render.

## Railway staging előkészítés

A repó külön Railway-konfigurációt tartalmaz a backendhez (`backend/railway.toml`) és a frontendhez (`frontend/railway.toml`). A backend staging módban kötelező PostgreSQL `DATABASE_URL`-t és `STAGING_PROXY_TOKEN`-t kér, publikus domain nélkül futtatható, és a `/api/ready` healthcheck az adatbázist is ellenőrzi. A frontend production buildet a saját Node gateway szolgálja ki, vendégként hitelesítés nélkül megnyitható, a `/api` kéréseket pedig a backend privát Railway-címére továbbítja.

A felületi létrehozási és ellenőrzési lépések a [RAILWAY_STAGING.md](RAILWAY_STAGING.md) fájlban vannak. A staging külön adatbázissal indul, helyi PostgreSQL- vagy SQLite-adatot nem másol át automatikusan. Valós Railway-projekt létrehozása, domain-kiadás és deploy ebben a munkamenetben nem történt.

Staging buildnél a backend Nixpacks Python 3.12-t és a `requirements.txt` telepítőt használ; a frontend Node 22.12.0-ra van rögzítve. A frontend Railway build parancsa csak `npm run build`, mert a Nixpacks install fázisa már elvégzi az `npm ci` lépést.



## M5 — Vendég és felhasználói mód

Vendégként a napló IndexedDB-ben, háromnapos nézettel működik; régi rekord importig megmarad. A személyes API sessiont és íráskor CSRF-tokent kér.

Ellenőrzés: cd backend; ..\.venv\Scripts\python.exe -m pytest -q; cd frontend; npm.cmd run typecheck; npm.cmd run lint; npm.cmd run test -- --run; npm.cmd run test:gateway; npm.cmd run build. Migráció: cd backend; ..\.venv\Scripts\python.exe -m alembic upgrade head.

Staging/prod email-delivery adapter és valós deploy nincs végrehajtva.
