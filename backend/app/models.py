from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Food(Base):
    __tablename__ = "foods"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_food_source_source_id"),
        Index("ix_foods_normalized_name", "normalized_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    normalized_name: Mapped[str] = mapped_column(String(600), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(200), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    available_carbs_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(12), nullable=True)
    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_generic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    source_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Budapest")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )


class MealEntry(Base):
    __tablename__ = "meal_entries"
    __table_args__ = (
        UniqueConstraint("profile_id", "idempotency_key", name="uq_meal_entries_profile_idempotency"),
        Index("ix_meal_entries_profile_local_date", "profile_id", "local_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    food_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("foods.id", ondelete="SET NULL"), nullable=True)
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    amount_g: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    meal_category: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    calculated_carbs_g: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
