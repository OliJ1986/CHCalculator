from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Index, JSON, String, Text, UniqueConstraint
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
