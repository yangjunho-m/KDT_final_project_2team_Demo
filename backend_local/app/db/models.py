from datetime import datetime, timezone

UTC = timezone.utc

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="ADMIN")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class OperationAreaRecord(Base):
    __tablename__ = "operation_areas"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    radius_meters: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class DroneRecord(Base):
    __tablename__ = "drones"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    operation_area_id: Mapped[str | None] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mission_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    icon_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    card_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    departure_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    departure_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    departure_altitude: Mapped[float] = mapped_column(Float, nullable=False)
    current_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    current_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    current_altitude: Mapped[float] = mapped_column(Float, nullable=False)
    movement_target_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    movement_target_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    movement_target_altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    movement_client_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="READY", index=True)
    heading: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    battery: Mapped[float] = mapped_column(Float, nullable=False, default=100)
    speed: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    signal_status: Mapped[str] = mapped_column(String(30), nullable=False, default="NORMAL")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class TargetRecord(Base):
    __tablename__ = "targets"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    operation_area_id: Mapped[str] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="UNKNOWN")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    movement_direction: Mapped[float | None] = mapped_column(Float, nullable=True)
    movement_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class ScenarioRecord(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    operation_area_id: Mapped[str] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=False,
        index=True,
    )
    scenario_name: Mapped[str] = mapped_column(String(100), nullable=False)
    target_drone_ids: Mapped[str] = mapped_column(Text, nullable=False)
    effect_type: Mapped[str] = mapped_column(String(30), nullable=False)
    intensity: Mapped[float] = mapped_column(Float, nullable=False)
    duration_ms: Mapped[int] = mapped_column(nullable=False)
    seed: Mapped[int] = mapped_column(nullable=False, default=1)
    auto_recovery: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="RUNNING", index=True)
    center_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    center_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    center_altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_meters: Mapped[float] = mapped_column(Float, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class ScenarioTemplateRecord(Base):
    __tablename__ = "scenario_templates"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scenario_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    interference_zone_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class InferenceJobRecord(Base):
    __tablename__ = "inference_jobs"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    operation_area_id: Mapped[str] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=False,
        index=True,
    )
    drone_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    requested_by: Mapped[str] = mapped_column(String(50), nullable=False, default="USR-001")
    model_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="DEMO")
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="DEMO_FRAME")
    source_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="COMPLETED", index=True)
    estimated_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    report_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SatelliteImageRecord(Base):
    __tablename__ = "satellite_images"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    zoom_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )


class DroneImageRecord(Base):
    __tablename__ = "drone_images"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    drone_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    dataset_prefix: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    route_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    frame_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )


class FaissVectorIndexRecord(Base):
    __tablename__ = "faiss_vector_indexes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    index_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    index_type: Mapped[str] = mapped_column(String(50), nullable=False, default="IndexFlatL2")
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False, default="demo-embedding")
    embedding_dimension: Mapped[int] = mapped_column(Integer, nullable=False, default=512)
    metric_type: Mapped[str] = mapped_column(String(30), nullable=False, default="L2")
    index_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    metadata_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="READY", index=True)
    vector_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class ImageEmbeddingRecord(Base):
    __tablename__ = "image_embeddings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    index_id: Mapped[str] = mapped_column(
        ForeignKey("faiss_vector_indexes.id"),
        nullable=False,
        index=True,
    )
    image_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    image_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    faiss_vector_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    embedding_dimension: Mapped[int] = mapped_column(Integer, nullable=False, default=512)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False, default="demo-embedding")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )


class GeoSearchRequestRecord(Base):
    __tablename__ = "geo_search_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    index_id: Mapped[str | None] = mapped_column(
        ForeignKey("faiss_vector_indexes.id"),
        nullable=True,
        index=True,
    )
    query_image_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    query_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    query_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_k: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by: Mapped[str] = mapped_column(String(50), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ScenarioRunRecord(Base):
    __tablename__ = "scenario_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    area_id: Mapped[str] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=False,
        index=True,
    )
    scenario_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    interference_zone_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class ScenarioDroneRuntimeRecord(Base):
    __tablename__ = "scenario_drone_runtimes"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("scenario_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drone_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    phase: Mapped[str] = mapped_column(String(50), nullable=False)
    current_position_json: Mapped[str] = mapped_column(Text, nullable=False)
    inside_interference_zone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    interference_json: Mapped[str] = mapped_column(Text, nullable=False)
    navigation_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class ReportRecord(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    operation_area_id: Mapped[str | None] = mapped_column(
        ForeignKey("operation_areas.id"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    client_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NEW", index=True)
    important: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    drone_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    target_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    scenario_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    inference_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    event_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    dataset_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    attachments: Mapped[list["ReportAttachmentRecord"]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ReportAttachmentRecord(Base):
    __tablename__ = "report_attachments"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    report_id: Mapped[str] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    report: Mapped[ReportRecord] = relationship(back_populates="attachments")
