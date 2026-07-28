from functools import lru_cache
from os import getenv

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "defense-surveillance-backend"
    app_env: str = "local"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "sqlite:///./local-data/drone_platform.db"
    dataset_storage_dir: str = "datasets"
    report_storage_dir: str = "reports"
    asset_storage_dir: str = "assets"
    local_inference_agent_url: str = "http://localhost:8010"
    local_storage_dir: str = "local-storage"
    faiss_index_dir: str = "storage/faiss"
    faiss_default_index_name: str = "drone-image-geoloc-demo"
    faiss_embedding_model: str = "demo-embedding"
    faiss_embedding_dimension: int = 512
    faiss_metric_type: str = "L2"

    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50
    allowed_file_extensions: str = ".jpg,.jpeg,.png,.webp,.json,.geojson"

    log_level: str = "INFO"
    secret_key: str = "replace-with-local-secret"
    access_token_expire_minutes: int = 60
    demo_admin_username: str = "demo_admin"
    demo_admin_password: str = "replace-with-local-password"
    seed_admin: bool = True
    seed_demo_data: bool = False
    seed_e2e_fixture: bool = False
    scenario_tick_scheduler_enabled: bool = True
    scenario_tick_interval_seconds: float = 1.0
    drone_view_playback_enabled: bool = True
    drone_view_dataset_prefix: str = "demo-drone-surveillance-route/drone-route"
    drone_view_jamming_dataset_prefix: str = "jamming-route"
    drone_view_spoofing_dataset_prefix: str = "spoofing-route"
    drone_view_drone_c_dataset_prefix: str = ""
    drone_view_drone_c_metadata_file: str = "metadata_songdo.csv"
    drone_view_drone_c_image_dataset_prefix: str = ""
    drone_view_drone_c_image_route_id: str = "ROUTE_B"
    drone_view_drone_c_image_scenario_name: str = "NORMAL"
    drone_view_metadata_file: str = "metadata.csv"
    drone_view_simulation_file: str = "drone_surveillance_simulation.csv"
    drone_view_playback_speed: float = 1.0
    auto_create_demo_drones: bool = True
    seed_drone_view_dataset: bool = False
    drone_view_operation_area_id: str = "AREA-DATASET-001"
    drone_view_operation_area_name: str = "CSV local demo area"

    @property
    def allowed_extensions(self) -> set[str]:
        return {
            extension.strip().lower()
            for extension in self.allowed_file_extensions.split(",")
            if extension.strip()
        }

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=getenv("APP_NAME", Settings().app_name),
        app_env=getenv("APP_ENV", Settings().app_env),
        app_host=getenv("APP_HOST", Settings().app_host),
        app_port=int(getenv("APP_PORT", str(Settings().app_port))),
        api_prefix=getenv("API_PREFIX", Settings().api_prefix),
        cors_origins=getenv("CORS_ORIGINS", Settings().cors_origins),
        database_url=getenv("DATABASE_URL", Settings().database_url),
        dataset_storage_dir=getenv("DATASET_STORAGE_DIR", Settings().dataset_storage_dir),
        report_storage_dir=getenv("REPORT_STORAGE_DIR", Settings().report_storage_dir),
        asset_storage_dir=getenv("ASSET_STORAGE_DIR", Settings().asset_storage_dir),
        local_inference_agent_url=getenv(
            "LOCAL_INFERENCE_AGENT_URL",
            Settings().local_inference_agent_url,
        ),
        local_storage_dir=getenv("LOCAL_STORAGE_DIR", Settings().local_storage_dir),
        faiss_index_dir=getenv("FAISS_INDEX_DIR", Settings().faiss_index_dir),
        faiss_default_index_name=getenv(
            "FAISS_DEFAULT_INDEX_NAME",
            Settings().faiss_default_index_name,
        ),
        faiss_embedding_model=getenv(
            "FAISS_EMBEDDING_MODEL",
            Settings().faiss_embedding_model,
        ),
        faiss_embedding_dimension=int(
            getenv(
                "FAISS_EMBEDDING_DIMENSION",
                str(Settings().faiss_embedding_dimension),
            )
        ),
        faiss_metric_type=getenv("FAISS_METRIC_TYPE", Settings().faiss_metric_type),
        upload_dir=getenv("UPLOAD_DIR", Settings().upload_dir),
        max_upload_size_mb=int(getenv("MAX_UPLOAD_SIZE_MB", str(Settings().max_upload_size_mb))),
        allowed_file_extensions=getenv(
            "ALLOWED_FILE_EXTENSIONS",
            Settings().allowed_file_extensions,
        ),
        log_level=getenv("LOG_LEVEL", Settings().log_level),
        secret_key=getenv("SECRET_KEY", Settings().secret_key),
        access_token_expire_minutes=int(
            getenv(
                "ACCESS_TOKEN_EXPIRE_MINUTES",
                str(Settings().access_token_expire_minutes),
            )
        ),
        demo_admin_username=getenv("DEMO_ADMIN_USERNAME", Settings().demo_admin_username),
        demo_admin_password=getenv("DEMO_ADMIN_PASSWORD", Settings().demo_admin_password),
        seed_admin=_parse_bool(getenv("SEED_ADMIN", str(Settings().seed_admin))),
        seed_demo_data=_parse_bool(getenv("SEED_DEMO_DATA", str(Settings().seed_demo_data))),
        seed_e2e_fixture=_parse_bool(
            getenv("SEED_E2E_FIXTURE", str(Settings().seed_e2e_fixture))
        ),
        scenario_tick_scheduler_enabled=_parse_bool(
            getenv(
                "SCENARIO_TICK_SCHEDULER_ENABLED",
                str(Settings().scenario_tick_scheduler_enabled),
            )
        ),
        scenario_tick_interval_seconds=float(
            getenv(
                "SCENARIO_TICK_INTERVAL_SECONDS",
                str(Settings().scenario_tick_interval_seconds),
            )
        ),
        drone_view_playback_enabled=_parse_bool(
            getenv(
                "DRONE_VIEW_PLAYBACK_ENABLED",
                str(Settings().drone_view_playback_enabled),
            )
        ),
        drone_view_dataset_prefix=getenv(
            "DRONE_VIEW_DATASET_PREFIX",
            Settings().drone_view_dataset_prefix,
        ).strip("/"),
        drone_view_jamming_dataset_prefix=getenv(
            "DRONE_VIEW_JAMMING_DATASET_PREFIX",
            Settings().drone_view_jamming_dataset_prefix,
        ).strip("/"),
        drone_view_spoofing_dataset_prefix=getenv(
            "DRONE_VIEW_SPOOFING_DATASET_PREFIX",
            Settings().drone_view_spoofing_dataset_prefix,
        ).strip("/"),
        drone_view_drone_c_dataset_prefix=getenv(
            "DRONE_VIEW_DRONE_C_DATASET_PREFIX",
            Settings().drone_view_drone_c_dataset_prefix,
        ).strip("/"),
        drone_view_drone_c_metadata_file=getenv(
            "DRONE_VIEW_DRONE_C_METADATA_FILE",
            Settings().drone_view_drone_c_metadata_file,
        ).lstrip("/"),
        drone_view_drone_c_image_dataset_prefix=getenv(
            "DRONE_VIEW_DRONE_C_IMAGE_DATASET_PREFIX",
            Settings().drone_view_drone_c_image_dataset_prefix,
        ).strip("/"),
        drone_view_drone_c_image_route_id=getenv(
            "DRONE_VIEW_DRONE_C_IMAGE_ROUTE_ID",
            Settings().drone_view_drone_c_image_route_id,
        ),
        drone_view_drone_c_image_scenario_name=getenv(
            "DRONE_VIEW_DRONE_C_IMAGE_SCENARIO_NAME",
            Settings().drone_view_drone_c_image_scenario_name,
        ),
        drone_view_metadata_file=getenv(
            "DRONE_VIEW_METADATA_FILE",
            Settings().drone_view_metadata_file,
        ).lstrip("/"),
        drone_view_simulation_file=getenv(
            "DRONE_VIEW_SIMULATION_FILE",
            Settings().drone_view_simulation_file,
        ).lstrip("/"),
        drone_view_playback_speed=float(
            getenv(
                "DRONE_VIEW_PLAYBACK_SPEED",
                str(Settings().drone_view_playback_speed),
            )
        ),
        auto_create_demo_drones=_parse_bool(
            getenv(
                "AUTO_CREATE_DEMO_DRONES",
                str(Settings().auto_create_demo_drones),
            )
        ),
        seed_drone_view_dataset=_parse_bool(
            getenv(
                "SEED_DRONE_VIEW_DATASET",
                str(Settings().seed_drone_view_dataset),
            )
        ),
        drone_view_operation_area_id=getenv(
            "DRONE_VIEW_OPERATION_AREA_ID",
            Settings().drone_view_operation_area_id,
        ),
        drone_view_operation_area_name=getenv(
            "DRONE_VIEW_OPERATION_AREA_NAME",
            Settings().drone_view_operation_area_name,
        ),
    )


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


