from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    ddl_statements: list[str] = []
    if "reports" in table_names:
        report_columns = {column["name"] for column in inspector.get_columns("reports")}
        if "operation_area_id" not in report_columns:
            ddl_statements.append("ALTER TABLE reports ADD COLUMN operation_area_id VARCHAR(30)")
        if "client_request_id" not in report_columns:
            ddl_statements.append("ALTER TABLE reports ADD COLUMN client_request_id VARCHAR(100)")
        indexes = {index["name"] for index in inspector.get_indexes("reports")}
        unique_constraints = {
            constraint["name"]
            for constraint in inspector.get_unique_constraints("reports")
        }
        if (
            "uq_reports_client_request_id" not in indexes
            and "uq_reports_client_request_id" not in unique_constraints
        ):
            if engine.dialect.name == "postgresql":
                ddl_statements.append(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_client_request_id "
                    "ON reports (client_request_id) WHERE client_request_id IS NOT NULL"
                )
            else:
                ddl_statements.append(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_client_request_id "
                    "ON reports (client_request_id)"
                )

    if "drones" in table_names:
        drone_columns = {column["name"] for column in inspector.get_columns("drones")}
        if "movement_client_request_id" not in drone_columns:
            ddl_statements.append(
                "ALTER TABLE drones ADD COLUMN movement_client_request_id VARCHAR(100)"
            )

    if "scenario_runs" in table_names:
        scenario_run_columns = {column["name"] for column in inspector.get_columns("scenario_runs")}
        if "event_sequence" not in scenario_run_columns:
            ddl_statements.append(
                "ALTER TABLE scenario_runs ADD COLUMN event_sequence INTEGER DEFAULT 0 NOT NULL"
            )

    if "targets" in table_names:
        target_columns = {column["name"] for column in inspector.get_columns("targets")}
        if "image_url" not in target_columns:
            ddl_statements.append("ALTER TABLE targets ADD COLUMN image_url VARCHAR(500)")

    if not ddl_statements:
        return

    with engine.begin() as connection:
        for ddl_statement in ddl_statements:
            connection.execute(text(ddl_statement))
