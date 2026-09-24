# CHill

## Aktuális tervezési állapot — 2026-09-24

M0–M1.2, benne M1.2.1–M1.2.3: **DONE**, a feltöltött dokumentáció szerinti lezárt történet. M1.3, M2, M3 és M4: **TODO**, ebben a dokumentációs munkában implementáció és új alkalmazásteszt nem történt. Következő feladat: **M1.3**, majd M2 → M3 → M4. A korábbi tesztszámok és élő eredmények történeti bizonyítékok, nem a mostani kód független ellenőrzései.

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

A fenti futtatóparancsok a feltöltött M1.2.3 állapothoz tartoznak. M1.3 még nincs implementálva: PostgreSQL-, Alembic- és importparancsot csak a tényleges eszközök elkészítése után szabad működőként dokumentálni.

M1.3 lezárásakor ez a README kapja meg az ellenőrzött lépéseket: helyi PostgreSQL indítása → külön dev/test DB létrehozása → helyi, titkos DATABASE_URL konfigurálása → Alembic upgrade head → SQLite backup/dry-run/import/ellenőrzés → backend indítása → integrációs tesztek. Ne írd felül a meglévő .env-et; a példában csak helyőrzők legyenek. A prod Railway DB nem helyi fejlesztési cél.

Railway-re külön backend és PostgreSQL szolgáltatás készül elő, dokumentált pre-deploy migrációval, PORT/healthcheck/CORS és frontend API-címmel. Valós deploy és éles adatátvitel külön feladat. Auth nélküli étkezési napló nem tehető nyilvánossá.

Az M2 kalkulátor, M3 tartós snapshot-napló és M4 hatálynapos saját célok részletes követelménye a TASKS.md-ben van. A nyolc dokumentum mellé adott CODEX_PROMPT.md indítja az autonóm megvalósítást; ez a csomag dokumentáció, nem már elkészült alkalmazásfrissítés.
