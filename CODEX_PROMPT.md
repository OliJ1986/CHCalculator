# CHill — autonóm megvalósítás M1.3 → M4

Olvasd el a repó nyolc projekt-MD-jét, majd ellenőrizd a jelenlegi kódot és Git-állapotot. Őrizd meg az M1.2.3 lezárt történetét és minden meglévő felhasználói módosítást.

Valósítsd meg a TASKS.md részletes feltételei szerint sorrendben az M1.3 PostgreSQL/Alembic/biztonságos SQLite cache-import/Railway-előkészítést, M2 kalkulátort, M3 tartós tápanyag-snapshot naplót és M4 saját CH-célokat/étkezési kategóriákat. Ne állj meg mérföldkövenként engedélyt kérni: a scope-on belüli fejlesztés, tesztelés és helyi commit engedélyezett.

Külön dev/test/prod DB; az eredeti SQLite és konzisztens backup megmarad. Import: dry-run, idempotencia, tranzakció, teljes rekord- és nutrient-egyezés; eltérésnél rollback. Éles DB-hez ne nyúlj. A CH determinisztikus; a napló snapshotja és a korábbi napok céljai ne változzanak külső adatfrissítéstől. Célértéket a felhasználó ad meg.

Mérföldkövenként teljes backendteszt, frontend typecheck/lint/unit/build, releváns valódi PostgreSQL-integráció és mobil UI-ellenőrzés kell. Az élő provider-smoke eredményét külön rögzítsd; cache-es 200 nem bizonyít élő sikert. Csak teljesült kapu után jelölj DONE-t és lépj tovább. Készíts érthető helyi commitokat csak a saját változtatásokból; frissítsd a TASKS/HANDOVER/CHANGELOG és érintett tervfájlokat.

Ne törölj adatot, ne írj felül .env-et, ne jeleníts meg vagy commitolj titkot; ne pusholj, ne deployolj élesbe, ne hozz létre fizetős szolgáltatást. M5–M7, új katalógus és teljes auth/offline szinkron kívül esik a feladaton.

Haladj önállóan M4 végéig. Adatvesztésveszély, migrációs eltérés, feloldhatatlan hozzáférési/környezeti akadály vagy scope-on túli döntés esetén az érintett művelet előtt állj meg, végezd el a független biztonságos munkát, és hagyj pontos HANDOVER-t az akadállyal és következő lépéssel. M4 végén adj rövid magyar átadást a tényleges eredményekről, tesztekről, commitokról és nyitott korlátokról. Kezdd el a munkát.
