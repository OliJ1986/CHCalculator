"""Safe, explicit SQLite cache import into a PostgreSQL-compatible schema."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sqlite3
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import MetaData, Table, create_engine, inspect, select
from sqlalchemy.engine import Connection, Engine

FOOD_FIELDS = (
    "id",
    "name",
    "original_name",
    "normalized_name",
    "brand",
    "barcode",
    "source",
    "source_id",
    "available_carbs_100g",
    "serving_size_g",
    "image_url",
    "language",
    "country",
    "is_generic",
    "is_verified",
    "category",
    "source_payload",
    "created_at",
    "updated_at",
)
COMPARE_FIELDS = tuple(field for field in FOOD_FIELDS if field != "id")


class CacheImportError(RuntimeError):
    """A source, target or verification condition prevents a safe import."""


class ImportConflictError(CacheImportError):
    """An existing target row differs from the source row with the same identity."""

    def __init__(self, conflicts: list[tuple[str, str]]) -> None:
        self.conflicts = conflicts
        super().__init__(f"{len(conflicts)} import conflict(s)")


@dataclass(frozen=True)
class ImportReport:
    source_rows: int
    target_rows_before: int
    identical_rows: int
    candidate_insert_rows: int
    inserted_rows: int
    conflicts: tuple[tuple[str, str], ...]
    source_digest: str
    backup_path: str
    dry_run: bool
    target_environment: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _canonical_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, float):
        return format(Decimal(str(value)), "f")
    if isinstance(value, dict):
        return {str(key): _canonical_value(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_canonical_value(item) for item in value]
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(_canonical_value(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _parse_datetime(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    return value


def _parse_source_value(field: str, value: Any) -> Any:
    if field == "source_payload" and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise CacheImportError("Érvénytelen source_payload JSON") from exc
    if field in {"created_at", "updated_at"}:
        return _parse_datetime(value)
    if field in {"is_generic", "is_verified"}:
        return bool(value)
    return value


def _record_key(record: dict[str, Any]) -> tuple[str, str]:
    return str(record["source"]), str(record["source_id"])


def _compare_record(source: dict[str, Any], target: dict[str, Any]) -> bool:
    return _canonical_json({field: source.get(field) for field in COMPARE_FIELDS}) == _canonical_json(
        {field: target.get(field) for field in COMPARE_FIELDS}
    )


def _open_read_only(path: pathlib.Path) -> sqlite3.Connection:
    if not path.is_file():
        raise CacheImportError(f"SQLite forrás nem található: {path.name}")
    connection = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def _load_sqlite(path: pathlib.Path) -> tuple[list[dict[str, Any]], str]:
    connection = _open_read_only(path)
    try:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise CacheImportError("SQLite integritásellenőrzés sikertelen")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise CacheImportError("SQLite foreign key ellenőrzés sikertelen")
        tables = {
            row[0]
            for row in connection.execute(
                "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
            )
        }
        if tables != {"foods"}:
            raise CacheImportError(f"Ismeretlen SQLite táblák: {sorted(tables - {'foods'})}")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(foods)")}
        missing = set(FOOD_FIELDS) - columns
        if missing:
            raise CacheImportError(f"Hiányzó foods oszlopok: {sorted(missing)}")
        rows = []
        seen: set[tuple[str, str]] = set()
        for row in connection.execute("select * from foods order by source, source_id"):
            record = {field: _parse_source_value(field, row[field]) for field in FOOD_FIELDS}
            key = _record_key(record)
            if key in seen:
                raise CacheImportError(f"Duplikált forrásazonosító: {key[0]}:{key[1]}")
            seen.add(key)
            rows.append(record)
        digest = hashlib.sha256(_canonical_json(rows).encode("utf-8")).hexdigest()
        return rows, digest
    finally:
        connection.close()


def _create_or_verify_backup(source: pathlib.Path, backup: pathlib.Path) -> None:
    source_rows, source_digest = _load_sqlite(source)
    if backup.exists():
        backup_rows, backup_digest = _load_sqlite(backup)
        if source_digest != backup_digest or len(source_rows) != len(backup_rows):
            raise CacheImportError("A meglévő SQLite-backup nem egyezik a forrással")
        return
    backup.parent.mkdir(parents=True, exist_ok=True)
    source_connection = _open_read_only(source)
    target_connection = sqlite3.connect(backup)
    try:
        source_connection.backup(target_connection)
        target_connection.commit()
    finally:
        source_connection.close()
        target_connection.close()
    backup_rows, backup_digest = _load_sqlite(backup)
    if source_digest != backup_digest or len(source_rows) != len(backup_rows):
        raise CacheImportError("A létrehozott SQLite-backup nem egyezik a forrással")


def _require_target_schema(connection: Connection) -> Table:
    if "foods" not in inspect(connection).get_table_names():
        raise CacheImportError("A cél PostgreSQL-ben nincs foods tábla; futtasd az Alembic upgrade head-et")
    table = Table("foods", MetaData(), autoload_with=connection)
    missing = set(FOOD_FIELDS) - set(table.c.keys())
    if missing:
        raise CacheImportError(f"Hiányzó céloszlopok: {sorted(missing)}")
    return table


def _target_records(connection: Connection, table: Table) -> dict[tuple[str, str], dict[str, Any]]:
    records: dict[tuple[str, str], dict[str, Any]] = {}
    for row in connection.execute(select(table)).mappings():
        record = {field: row.get(field) for field in FOOD_FIELDS}
        key = _record_key(record)
        if key in records:
            raise CacheImportError(f"Duplikált cél forrásazonosító: {key[0]}:{key[1]}")
        records[key] = record
    return records


def _insert_values(record: dict[str, Any], table: Table) -> dict[str, Any]:
    return {field: record.get(field) for field in FOOD_FIELDS if field in table.c}


def import_sqlite_cache(
    *,
    source_path: str | pathlib.Path,
    target_url: str,
    environment: str,
    dry_run: bool = True,
    backup_path: str | pathlib.Path | None = None,
    allow_non_postgresql_target: bool = False,
) -> ImportReport:
    """Audit and optionally import a complete SQLite cache transactionally."""
    if environment not in {"dev", "test"}:
        raise CacheImportError("Import csak dev vagy test célba engedélyezett; prod tiltott")
    if not allow_non_postgresql_target and not target_url.startswith(("postgresql", "postgres")):
        raise CacheImportError("Az import célja M1.3 szerint PostgreSQL kell legyen")
    source = pathlib.Path(source_path).resolve()
    backup = pathlib.Path(backup_path).resolve() if backup_path else source.parent / "backups" / f"{source.stem}.pre-import.sqlite"
    if source == backup:
        raise CacheImportError("A backup nem lehet azonos a SQLite forrással")
    _create_or_verify_backup(source, backup)
    source_records, source_digest = _load_sqlite(source)

    engine: Engine = create_engine(target_url, future=True)
    try:
        with engine.begin() as connection:
            table = _require_target_schema(connection)
            existing = _target_records(connection, table)
            source_by_key = {_record_key(record): record for record in source_records}
            conflicts = [
                key
                for key, record in source_by_key.items()
                if key in existing and not _compare_record(record, existing[key])
            ]
            if conflicts:
                raise ImportConflictError(conflicts)
            identical = sum(1 for record in source_records if _record_key(record) in existing)
            to_insert = [record for record in source_records if _record_key(record) not in existing]
            if dry_run:
                return ImportReport(
                    source_rows=len(source_records),
                    target_rows_before=len(existing),
                    identical_rows=identical,
                    candidate_insert_rows=len(to_insert),
                    inserted_rows=0,
                    conflicts=(),
                    source_digest=source_digest,
                    backup_path=str(backup),
                    dry_run=True,
                    target_environment=environment,
                )
            if to_insert:
                connection.execute(table.insert(), [_insert_values(record, table) for record in to_insert])
            imported = _target_records(connection, table)
            for record in source_records:
                key = _record_key(record)
                if key not in imported or not _compare_record(record, imported[key]):
                    raise CacheImportError(f"Visszaolvasási eltérés: {key[0]}:{key[1]}")
            return ImportReport(
                source_rows=len(source_records),
                target_rows_before=len(existing),
                identical_rows=identical,
                candidate_insert_rows=len(to_insert),
                inserted_rows=len(to_insert),
                conflicts=(),
                source_digest=source_digest,
                backup_path=str(backup),
                dry_run=False,
                target_environment=environment,
            )
    finally:
        engine.dispose()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CHill SQLite cache audit/import")
    parser.add_argument("--source", required=True, help="SQLite forrásfájl")
    parser.add_argument("--target", help="PostgreSQL DATABASE_URL; értéke nem kerül kiírásra")
    parser.add_argument("--target-env", help="Környezeti változó a PostgreSQL DATABASE_URL-hoz")
    parser.add_argument("--environment", required=True, choices=("dev", "test", "prod"))
    parser.add_argument("--backup", help="Konzisztens SQLite backup útvonala")
    parser.add_argument("--write", action="store_true", help="Írás engedélyezése; alapértelmezésben dry-run")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    target = args.target
    if not target and args.target_env:
        target = os.environ.get(args.target_env)
    if not target:
        _parser().error("--target vagy --target-env szükséges")
    try:
        report = import_sqlite_cache(
            source_path=args.source,
            target_url=target,
            environment=args.environment,
            dry_run=not args.write,
            backup_path=args.backup,
        )
    except ImportConflictError as exc:
        print(json.dumps({"error": "import_conflict", "count": len(exc.conflicts)}, ensure_ascii=True))
        return 2
    except CacheImportError as exc:
        print(json.dumps({"error": "cache_import_rejected", "type": type(exc).__name__}, ensure_ascii=True))
        return 2
    except Exception as exc:  # pragma: no cover - CLI boundary protects secrets
        print(json.dumps({"error": "import_failed", "type": type(exc).__name__}, ensure_ascii=True))
        return 1
    print(json.dumps(report.as_dict(), ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
