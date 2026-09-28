# CHill M22.1 kritikus mobil kamera- és UI-regressziók (2026-09-28)

## Eredmény

Az M22 előtti `05d417f` állapot és az M22 kód összevetése két bizonyítható regressziót tárt fel. A teljes képernyős kameraréteg vizuálisan `position: fixed` volt, de a DOM-ban továbbra is az animált `.add-sheet` alatt maradt. Emellett a vonalkódolvasó minden checksum-helyes felismerés után leállította a streamet még a backend lookup eredménye előtt. Így az ismeretlen termék és az átmeneti szolgáltatói hiba is úgy viselkedett, mintha a kamera váratlanul bezárult volna.

### A — kamera indulása és életciklusa

- A mockolt `getUserMedia` indulás, engedélymegtagadás, újrapróbálás, explicit leállítás, újraindítás, gyors módváltás és bezárási cleanup Chromiumban és WebKitben is működik.
- A kameraréteg most React portalon, a `#camera-root` alatt, a felviteli sheet testvéreként jelenik meg. Nyitáskor a háttérgörgetés zárolt; Escape vagy Vissza először ezt a réteget zárja.
- A teljes fejléc, előnézet és elsődleges művelet a 360×667-es nézetben is elfér; a réteg és gyermekei nem hoznak létre vízszintes túlcsordulást.

### B — vonalkód felismerése

- A regresszióteszt a valódi `@zxing/browser` dekódert használja ismert EAN-13 és EAN-8 SVG fixture-ökkel. A felismerés mindkét böngészőmotorban sikeres; a teszt nem mockolja a dekóder eredményét.
- Csak checksum-helyes EAN-8/EAN-13 jut tovább a meglévő lookup határhoz. A képfeltöltés és a kézi bevitel megmaradt.
- A fizikai iPhone fókusz, autofókusz, lencseválasztás és fényviszonyok automatizált desktop runnerből nem bizonyíthatók; ezek külön eszközkapuk.

### C — backend lookup

- A stream már nem áll le a lookup indítása előtt. Ismeretlen kód, hiányzó ellenőrzött CH vagy kérési hiba esetén aktív marad, a felhasználó ugyanazon a képernyőn újrapróbálhat.
- Csak elfogadott, naplózható termék állítja le a scannert és zárja a kameraréteget.
- A teszt egymás után egy `null` választ és egy sikeres termékválaszt ad; ellenőrzi, hogy az első után egyetlen track sem állt le, a második után pedig a termék kiválasztódik.

### D — váratlan bezáródás

- Megszűnt a sheethez kötött kamera-host, valamint a sikertelen lookup előtti automatikus stop. A bezárásnak most névvel ellátott oka van (`accepted`, `user`, `close`, `escape`, `unmount`, `startup_error`).
- A diagnosztika csak komponenst, eseményt, módot és logikai állapotot ír `console.debug` szinten. Vonalkódot, képet, felhasználói adatot vagy titkot nem naplóz.

## Mobil UI és OCR-biztonság

- A kamera egyszeri feladatválasztót kapott; aktív módban nincs öt füles módváltó. Egy fejléc, egy előnézet és az adott feladathoz tartozó műveletek látszanak.
- A hűtőfolyamat egy fotót teljes szélességen, kettő–négy fotót kéthasábos rácsban mutat. A csere és törlés minden kártyán belül marad.
- A rejtett fájlválasztó rögzített kezdőpozíciót kapott és kiválasztás után elveszíti a fókuszt; a fotók előre lefoglalt 4:3 képaránya megakadályozza, hogy a WebKit betöltés közben elmozdítsa a kameranézetet vagy a rácsot.
- A helyi OCR a fizikailag lehetetlen vagy erősen gyanús értékeket jelzi. A `159 g fehérje / 100 g vagy 100 ml` és `149 g zsír / 100 g vagy 100 ml` változatlanul látható, nem alakul nullává vagy kitalált értékké, és javításig blokkolja a mentést. Ugyanez érvényes negatív értékre, cukor > szénhidrát ellentmondásra és 105 g feletti fő tápanyag-összegre.

## Automatizált bizonyíték

- Backend: `..\.venv\Scripts\python.exe -m pytest -q -rs` → **100 passed, 7 skipped, 1 warning**. A skip-ek az izolált PostgreSQL URL és az opt-in élő Gemini futás hiányát jelzik; kamera/backend kód nem változott.
- Frontend unit: `npm.cmd run test` → **36 passed**.
- Frontend statikus kapuk: typecheck, lint és production build sikeres. A lint exit 0; a meglévő Camera/App effect figyelmeztetések megmaradtak.
- Browser: `npm.cmd run test:camera -- --workers=1` → **62 passed** (**31 Chromium + 31 WebKit**) 360×667, 375×812 és 390×844 méreteken.
- A böngészős csomag lefedi a start/restart/stop, gyors módváltás, engedélymegtagadás, valódi ZXing EAN-fixture, lookup siker/hiba, sikertelen lookup utáni aktív stream, gallery fallback, OCR-figyelmeztetés és 1/4 képes hűtőrács eseteket. DOM-koordináta ellenőrzés bizonyítja a viewporton belüli fejlécet, preview-t, elsődleges műveletet és fotógombokat; külön mérés igazolja a nulla oldal-, visual viewport- és kamerafolyam-görgetést, valamint a vízszintes túlcsordulás hiányát.
- A reprezentatív Chromium/WebKit képek a nem commitolt `frontend/test-results/m22/` könyvtárban készültek és vizuálisan ellenőrizve lettek.

## Nyitott eszközkapu

Fizikai iPhone Safarin még ellenőrizni kell: első és ismételt kameraengedély, elutasítás utáni folytatás; PWA és normál Safari; hátsó kamera/fókusz valós csomagoláson; ismert és ismeretlen EAN; hálózati lookup hiba utáni élő preview; stop/restart és gyors módváltás; galériás kép; álló/fekvő forgatás; valamint 1–4 valós hűtőfotó csere/törlés. Élő provider, Railway staging, push és deploy nem történt.
