# CHill – fizikai iPhone kamera-diagnosztika

## Cél és határ

Ez az ideiglenes mód a Safari-elrendezést, az élő kamera/ZXing útvonalat és a fényképes vonalkód-feldolgozást méri. Nem javítja és nem hangolja át ezeket a folyamatokat. A gyökérok csak a fizikai iPhone-ról másolt jelentés után állapítható meg.

A diagnosztika csak akkor kerül a frontend buildbe, ha egyszerre teljesül:

```text
APP_ENV=staging
VITE_CAMERA_DIAGNOSTICS=1
```

A Vite build hibával leáll, ha a diagnosztikai flag más környezetben van bekapcsolva. Kikapcsoláshoz törölni kell a `VITE_CAMERA_DIAGNOSTICS` változót vagy `0`-ra állítani, majd új frontend build szükséges. A flag build-time változó; egy már elkészült bundle viselkedését a futó konténer változójának átírása önmagában nem módosítja.

## Mit tartalmaz a jelentés?

- viewport-, dokumentum- és kameraelem-méretek, scroll- és fókuszállapot;
- a kiválasztott videotrack általános címkéje, állapota, facing mode-ja, felbontása és képkockasebessége;
- ZXing indulási, dekódolási és kategorizált hibaesemények;
- a kiválasztott fájl MIME-típusa és bájtmérete, a betöltött kép mérete, valamint a canvas-változatok mérete és eredménye.

A jelentés nem tartalmaz képet, képpontot, fájlnevet, teljes vagy részleges vonalkódot, eszközazonosítót, API-kulcsot vagy mezőértéket. Legfeljebb 250 eseményt tart memóriában, hálózaton nem küldi el, és lapfrissítéskor elveszik.

## Staging előkészítése

1. A frontend staging szolgáltatáson állítsd be a fenti két változót. Titkot nem kell hozzáadni.
2. Indíts kézi staging buildet/deployt. Ez a repository-munkamenet nem deployol.
3. iPhone-on első körben Privát Safariban nyisd meg a staging URL-t. Normál Safari/PWA tesztnél előtte töröld a staging domain webhelyadatait, hogy régi service worker vagy app shell ne fedje el az új buildet.
4. Nyisd meg: **Hozzáadás → Kamera → Vonalkód**. A lap alján a **Staging diagnosztika** panelnek meg kell jelennie.
5. Ha a panel hiányzik, ne folytasd a tesztet: a flag nem került bele a buildbe, vagy nem a staging bundle töltődött be.

A teszt előtt külön jegyezd fel az iPhone modelljét, az iOS verzióját, a Safari/PWA/Privát Safari módot és az álló vagy fekvő tájolást. Ezeket az alkalmazás nem gyűjti.

## 1. Safari-elrendezés és fókusz

1. Álló módban frissítsd a staging oldalt.
2. Nyisd meg a **Hozzáadás** sheetet, várj két másodpercet, és ne érints meg beviteli mezőt.
3. Nyisd meg a **Kamera → Vonalkód** nézetet.
4. A diagnosztikai panelen nyomd meg a **Mérés frissítése** gombot.
5. Készíts képernyőképet a látható vízszintes elcsúszásról.
6. Nyomd meg a **Másolás** gombot, és mentsd el a blokkot `LAYOUT-PORTRAIT` címkével.
7. Érintsd meg a **Vonalkód kézzel** mezőt, hogy megjelenjen a billentyűzet; ezután nyomd meg ismét a **Mérés frissítése**, majd a **Másolás** gombot. Mentsd `LAYOUT-KEYBOARD` címkével. A beírt értéket a jelentés nem tartalmazza.
8. Zárd be a billentyűzetet, fordítsd fekvő módba a telefont, ismételd meg a mérést, és mentsd `LAYOUT-LANDSCAPE` címkével.

Kiemelten vizsgálandó sorok: `innerWidth`, `documentScrollWidth`, `scrollX`, `visualWidth`, `visualScale`, `visualOffsetLeft`, `cameraX`, `cameraWidth`, `cameraRight`, `activeInput`, `autofocusCount` és `autofocusFocused`.

## 2. Élő vonalkódolvasás

1. Álló módban nyisd meg újra a vonalkódnézetet, majd nyomd meg a diagnosztikai panel **Törlés** gombját.
2. Nyomd meg az **Olvasás indítása** gombot, és engedélyezd a hátsó kamerát.
3. Tarts egy tiszta, ismert EAN-8 vagy EAN-13 kódot jó fényben a keretben 10–15 másodpercig. Próbáld meg körülbelül 10, 20 és 30 cm távolságból; közben ne használd a kézi mezőt.
4. Ha nincs találat, nyomd meg a **Leállítás** gombot. Ha a termék felismerése bezárja a kamerát, nyisd meg újra ugyanazt a nézetet; a memóriában lévő jelentés megmarad.
5. Nyomd meg a **Másolás** gombot, és mentsd `LIVE-BARCODE` címkével.

Elvárt diagnosztikai határpontok: `start_requested`, `zxing_import_succeeded`, `zxing_reader_created`, `get_user_media_succeeded`, `zxing_scanning_started`, `stream_snapshot`, `video_loaded_metadata` vagy `video_playing`, majd `decode_result` vagy mintavételezett `decode_error` kategóriák. A `decode_result` csak a karakterhosszt, a formátumot és az EAN-érvényességet jelzi.

## 3. Fényképes vonalkódolvasás

1. Nyisd meg újra a vonalkódnézetet, majd nyomd meg a diagnosztikai panel **Törlés** gombját.
2. Válaszd a **Képből olvasás** műveletet, és készíts az iPhone-nal éles fotót ugyanarról a vonalkódról. A teljes kód és a körülötte lévő üres terület legyen látható.
3. Várd meg a sikeres találatot vagy a „Nem találtam” üzenetet.
4. Sikertelen próbánál ismételd meg egy, a Fotók alkalmazásban már meglévő képpel is, ha a Safari felajánlja a fotókönyvtárat.
5. Ha a siker bezárja a kamerát, nyisd meg újra. Nyomd meg a **Másolás** gombot, és mentsd `PHOTO-BARCODE` címkével.

Elvárt diagnosztikai határpontok: `file_selected`, `image_loaded`, nyolc `variant_created` vagy konkrét `canvas_failed`, `variants_complete`, majd változatonként `decode_result` vagy `decode_error`. A fájlnév és a kép tartalma nem kerül a jelentésbe.

## Visszaadandó csomag

Küldd vissza az alábbiakat egy üzenetben:

1. iPhone modell, iOS-verzió, Safari/PWA/Privát Safari és tájolás;
2. a vízszintes elcsúszást mutató képernyőkép;
3. `LAYOUT-PORTRAIT`, `LAYOUT-KEYBOARD` és `LAYOUT-LANDSCAPE` blokkok;
4. `LIVE-BARCODE` blokk;
5. `PHOTO-BARCODE` blokk;
6. röviden: látszott-e élő preview, változott-e a fókusz, és bezárult-e váratlanul a kamera.

Ne egészítsd ki a jelentést a tesztelt EAN számaival vagy a termék személyes beszerzési adataival. A következő fejlesztési kör először ezekből az adatokból állapítja meg a gyökérokot; csak utána készülhet javítás.
