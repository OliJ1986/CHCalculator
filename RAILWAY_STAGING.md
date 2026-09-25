# CHill Railway staging telepítési útmutató

Ez az útmutató privát, elkülönített staging környezet előkészítésére szolgál. A repó nem tartalmaz Railway hitelesítést, valódi staging titkot vagy adatbázis-importot; a létrehozást a Railway felületén kell elvégezni.

## 1. Projekt és környezet

1. A Railway felületén hozz létre egy új projektet.
2. A projekt környezetválasztójában hozz létre külön `staging` környezetet. Ne használd a production környezetet.
3. A staging környezetben adj hozzá egy új Railway PostgreSQL szolgáltatást. Ne linkeld a helyi `chill_dev` adatbázist, és ne tölts fel dumpot vagy SQLite-fájlt.

A staging adatbázis üresen indul. A backend pre-deploy lépése csak az Alembic sémát futtatja; a helyi cache-import szándékosan nincs deploy-hookba kötve.

## 2. Backend szolgáltatás

Adj hozzá egy GitHubból telepített szolgáltatást ugyanebből a repóból, majd a szolgáltatás beállításaiban állítsd:

- **Root Directory:** `/backend`
- **Config-as-code file:** `/backend/railway.toml`
- **Public domain:** ne generálj

A backend csak a Railway privát hálózatán legyen elérhető. A `/api/ready` healthcheck a `SELECT 1` lekérdezéssel az adatbázis-kapcsolatot is ellenőrzi.

A backend staging service variables mezőjében állítsd be az értékeket. A zárójeles Railway-referencia neve a felületen létrehozott PostgreSQL/backend szolgáltatás tényleges nevéhez igazítandó:

```text
APP_ENV=staging
DATABASE_URL=${{Postgres.DATABASE_URL}}
STAGING_PROXY_TOKEN=<véletlenszerű, hosszú token a Railway Variables mezőjében>
CORS_ORIGINS=
```

Ha stagingben USDA smoke tesztet futtatsz, a `USDA_API_KEY`-t ugyanitt, titkos változóként add meg. A kulcsot ne tedd a repóba, frontend változóba, build logba vagy képernyőképbe.

A Railway backend szolgáltatásának `preDeployCommand` értéke `alembic upgrade head`. Sikertelen migráció esetén az új kiadás nem indul el. A `/api/ready` útvonal kivételként elérhető a Railway healthcheck számára; minden más staging API-útvonal a proxy tokenét igényli.

A backend `requirements.txt`-ből telepít: a `backend/nixpacks.toml` Python providert, Python 3.12-t és a requirements csomagkezelőt rögzíti. A `pyproject.toml` csak teszt/lint beállításokat tartalmaz, ezért nem szabad Nixpacksnek a projekt telepítési forrásaként választania.

### Munkakönyvtár-szabály

A `/backend` Root Directory miatt a backend build- és deploy-parancsai már a `backend` könyvtárból futnak. Ezért a `/backend/railway.toml` fájlban helyes az `alembic upgrade head` és az `uvicorn app.main:app ...` forma; ide nem szabad `cd backend` előtagot tenni. A repógyökerű `railway.toml` külön fallback konfiguráció `/` Root Directory esetére, abban a `cd backend` szándékosan marad.

## 3. Frontend szolgáltatás

Adj hozzá második GitHub szolgáltatást ugyanabból a repóból:

- **Root Directory:** `/frontend`
- **Config-as-code file:** `/frontend/railway.toml`
- **Build:** Nixpacks install fázisban `npm ci`, build fázisban `npm run build`
- **Start:** `npm start`
- **Healthcheck:** `/healthz`

A frontend staging service variables értékei:

```text
APP_ENV=staging
BACKEND_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}
BACKEND_PROXY_TOKEN=${{backend.STAGING_PROXY_TOKEN}}
STAGING_BASIC_AUTH_USER=<staging-felhasználó>
STAGING_BASIC_AUTH_PASSWORD=<hosszú, egyedi staging-jelszó>
VITE_API_BASE_URL=/api
```

A `BACKEND_URL` és a token runtime változó. A `VITE_API_BASE_URL` buildkor bekerülhet a böngészőbe, ezért ide soha ne kerüljön titok. A frontend Node gateway Basic Auth-tal védi a staging domaint, a `/healthz` viszont hitelesítés nélkül válaszol a Railway healthchecknek. A `/api/*` kéréseket a gateway a backend privát címére továbbítja, és hozzáadja a token fejlécet.

A `/frontend` Root Directory miatt a `frontend/railway.toml` parancsai közvetlenül `npm run build` és `npm start` formában futnak; a Nixpacks install fázisa végzi az `npm ci`-t. `cd frontend` előtag nem szükséges.

A frontend `engines.node` és `.nvmrc` értéke kompatibilis Node 22-t rögzít (`22.12.0`), így a Vite nem indul Node 18 alatt. A `railway.toml` build parancsa csak `npm run build`: az install fázisban futó második `npm ci` eltávolítása megszünteti az ismételt `node_modules`-műveletet, amely az EBUSY hibát okozhatta.

Csak az elkészült Basic Auth változók után generálj egyetlen nyilvános frontend domaint. A backendhez ne generálj publikus domaint: a Railway privát hálózata nem böngészőből elérhető, ezért a böngésző kizárólag a frontend same-origin `/api` proxyját használja.

## 4. Telepítési sorrend és ellenőrzés

1. PostgreSQL szolgáltatás létrehozása a `staging` környezetben.
2. Backend szolgáltatás első deployja; ellenőrizd az Alembic headet és a `/api/ready` healthchecket.
3. Frontend szolgáltatás deployja; ezután generáld a nyilvános domaint.
4. Privát böngészőablakban nyisd meg a frontend domaint. Basic Auth nélkül 401, helyes adatokkal az alkalmazás jelenik meg.
5. Ellenőrizd a `/healthz` 200 válaszát, majd hitelesítve keress ételt és töltsd be a naplót/célokat. A böngésző hálózati nézetében az API-cél `/api/...` legyen, ne localhost és ne a backend publikus címe.
6. A Railway logban csak státuszt és általános hibát ellenőrizz; URL-t, jelszót, API-kulcsot vagy proxy tokent ne másolj át.

A service worker csak statikus erőforrásokat cache-el. A személyes `/api` válaszok nem kerülnek általános cache-first tárolóba. A staging adatbázisba nincs automatikus helyi adatmásolás.

### EBUSY utáni egyszeri tiszta build

A frontend service Variables nézetében ideiglenesen adj hozzá `NO_CACHE=1` változót, indítsd a legfrissebb commit új buildjét, és csak sikeres build után töröld ezt a változót. Ez a Railway build layer cache-ét üríti; a repóban nincs szükség `.dockerignore` vagy `.railwayignore` fájlra, mert a `node_modules`, `dist` és `.env` eleve a `.gitignore` alatt vannak, a GitHub-forrású build pedig ezeket nem küldi fel. Ha az EBUSY ismétlődik, hagyd a `NO_CACHE=1` változót a stagingen, amíg a Railway cache-réteg hibája ki nem zárható.

### Dashboard beállítások a hibajavításhoz

Backend service → **Settings → Source**:

- Root Directory: `/backend`
- Config File: `/backend/railway.toml`
- Build Command: üres (a config fájl kezelje)
- Start Command: üres (a config fájl kezelje)
- Variables: `NIXPACKS_PYTHON_VERSION=3.12`, `NIXPACKS_PYTHON_PACKAGE_MANAGER=requirements`

Frontend service → **Settings → Source**:

- Root Directory: `/frontend`
- Config File: `/frontend/railway.toml`
- Build Command: üres (a config fájl kezelje, Nixpacks install + `npm run build`)
- Start Command: üres (a config fájl kezelje)
- Variables: `NIXPACKS_NODE_VERSION=22`, egyszeri tiszta buildhez `NO_CACHE=1`

A root `railway.toml`-t ne állítsd be egyik staging service Config File mezőjében sem. A szolgáltatásoknál a fenti abszolút config útvonal maradjon kiválasztva.

## 5. Biztonsági korlátok és visszavonás

Ez a védelem egyetlen privát staging profilhoz és megosztott Basic Auth-hoz készült; nem teljes felhasználói auth és nem production hozzáférés-kezelés. Publikus vagy többfelhasználós kiadás előtt SSO/edge access és profil-szintű auth külön döntés szükséges.

Ha a staging hozzáférést vissza kell vonni, töröld vagy cseréld a frontend Basic Auth változóit, állítsd le a frontend domaint/szolgáltatást, majd cseréld a backend `STAGING_PROXY_TOKEN` értékét is. Ne töröld és ne állítsd vissza a helyi vagy production adatbázist ebből a folyamatból.

Railway dokumentáció: [monorepo root directory](https://docs.railway.com/deployments/monorepo), [build és deploy konfiguráció](https://docs.railway.com/builds/build-configuration), [pre-deploy parancs](https://docs.railway.com/deployments/pre-deploy-command), [staging izoláció](https://docs.railway.com/guides/isolate-staging-production), [privát hálózat](https://docs.railway.com/networking/private-networking), [frontend környezeti változók](https://docs.railway.com/guides/frontend-environment-variables).
