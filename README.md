# CHill

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a lezárt történet megőrizve. M1.3: **BLOCKED**, az előkészítő implementáció elkészült, de a valódi PostgreSQL-integrációhoz nincs helyi szerver vagy kijelölt test DB. M2, M3 és M4 még **TODO**, a sorrend nem lett megkerülve.

Az alábbi új terv az aktuális fejlesztési irány. A korábbi fejezetekben szereplő SQLite, frontend-state napló és M0-scope a korábbi vagy jelenlegi megvalósítást írják le; nem tiltják az M1.3–M4 bővítéseit. A részletes elfogadási feltételek forrása a `TASKS.md`.

Mobil-first szénhidrátszámláló PWA prototípus. A CHill célja egy gyors, egyszerű és vizuálisan karakteres napi CH-áttekintő.

## Stack

React, TypeScript, Vite, TanStack Query, React Router, CSS transitionök, saját manifest/service worker PWA-alap; backendként FastAPI, SQLAlchemy 2.x, Pydantic Settings és SQLite.

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

## Következő fejlesztés és konfiguráció [terv]

A fenti futtatóparancsok az M1.2.3 alap flow-ját mutatják. M1.3 előkészítő eszközei elkészültek, de a PostgreSQL-kapu helyi szerver nélkül nyitott marad.

M1.3 lezárásakor ez a README kapja meg az ellenőrzött lépéseket: helyi PostgreSQL indítása → külön dev/test DB létrehozása → helyi, titkos DATABASE_URL konfigurálása → Alembic upgrade head → SQLite backup/dry-run/import/ellenőrzés → backend indítása → integrációs tesztek. Ne írd felül a meglévő .env-et; a példában csak helyőrzők legyenek. A prod Railway DB nem helyi fejlesztési cél.

Az elkészült import eszköz alapértelmezésben dry-run:

```powershell
cd backend
python -m app.tools.cache_import --source chill.db --target-env DATABASE_URL --environment dev
python -m app.tools.cache_import --source chill.db --target-env DATABASE_URL --environment dev --write
```

Az import csak PostgreSQL dev/test célba írhat; a `DATABASE_URL` értéke nem kerül naplózásra. A tényleges PostgreSQL-kapuhoz külön `chill_test` adatbázis és `CHILL_TEST_DATABASE_URL` szükséges.

Railway-re külön backend és PostgreSQL szolgáltatás készül elő, dokumentált pre-deploy migrációval, PORT/healthcheck/CORS és frontend API-címmel. Valós deploy és éles adatátvitel külön feladat. Auth nélküli étkezési napló nem tehető nyilvánossá.

Az M2 kalkulátor, M3 tartós snapshot-napló és M4 hatálynapos saját célok részletes követelménye a TASKS.md-ben van. A nyolc dokumentum mellé adott CODEX_PROMPT.md indítja az autonóm megvalósítást; ez a csomag dokumentáció, nem már elkészült alkalmazásfrissítés.
