# CHill M22 UI/UX eredmény (2026-09-28)

## Állapot

Az M22 P1 javításai és a mobil UI-polish implementációja elkészült. A módosítás kizárólag a frontend Chef-, hűtőfotó-, katalógus-, tervező- és kamera-folyamatait érinti; backend, adatbázis, Railway és titokkezelési konfiguráció nem változott.

## Megvalósított javítások

- Az üres CH-mező hiányzó adat marad; a kifejezett `0` érvényes. A tizedes adagszám determinisztikusan kerül mentésre és megjelenítésre.
- A Chef egy receptazonosítót használ a recept-, napló- és tervműveletekhez. Ismételt mentés nem hoz létre új receptet; az idempotens naplókulcs és a részleges hibánál megjelenő célzott újrapróbálás megmarad.
- Chef befejezéskor frissül a napló, cél, recept, terv és bevásárlólista lekérdezése.
- A hűtőfolyamatban a bizonytalan találatok és a teljes válasz bizonytalansága megmarad, nulla felismerés után kézi leltár indítható, a fotók cserélhetők és a 4 képes korlát látható.
- A fotók felismerésig helyben maradásáról és a felismeréskor történő elküldésről egyértelmű tájékoztatás jelenik meg.
- A recept- és Chef-lépések kompakt, egyenként nyitható összetevő-sorokat használnak; a vázlat a hűtőfolyamat lépései között nem kerül lecsatolásra.
- A katalógus alapértelmezett nézete a saját étellista, a receptek külön nézetet kaptak, a bevásárlólista a Tervezőből közvetlenül elérhető, a navigáció `aria-current` állapotot ad.
- A bevásárlólista kézi tétele valódi névvel készül; ismeretlen mennyiségnél „Mennyiség később” jelenik meg. A következő nap számítása naptári napot lép, hétváltáskor sem moduloz vissza.
- Közös `field-stack`, képernyőfejléc és állapotüzenet primitívek, 44 px-es érintési célok, mobilon egymás alá rendezett mezők és teljes képernyős, safe-area-kompatibilis kamera-folyamat készültek. A kamera belső ismétlődő bezáró gombjai el vannak rejtve, a hiba- és állapotüzenetek megmaradnak.

## Ellenőrzések

- Backend: `..\.venv\Scripts\python.exe -m pytest -q` emelt Windows futtatással: **100 passed, 7 skipped, 1 warning**. A normál sandbox futtatásban három cache-import tesztet a Windows pytest-temp ACL blokkolt; ezeket az emelt futtatás zöldre hozta.
- Frontend unit: `npm.cmd run test -- --run`: **34 passed**.
- Frontend: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: sikeres. A lint csak a korábbi Camera/App effect/dependency figyelmeztetéseket jelzi.
- Browser: `npm.cmd run test:camera -- --workers=1`: **56 passed** Chromium és WebKit alatt, 360/375/390 px nézeteken. A külön M22 vizuális teszt 360×667 px-en mindkét motorban futott.
- A vizuális teszt képei a nem commitolt `frontend/test-results/m22/` könyvtárban készültek; ezek csak helyi QA-artifactok.

## Nyitott kapuk

Fizikai iPhone Safari, élő Railway/Gemini/OFF szolgáltatói smoke és staging deployment ebben a munkamenetben nem futott. A M22 automatizált kapui zöldek, de ezeket a készülék- és staging-ellenőrzéseket külön kell elvégezni.
