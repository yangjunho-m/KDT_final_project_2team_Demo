from collections.abc import Iterator
from mimetypes import guess_type
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.core.errors import AppError


def upload_report_file(file_name: str, content_type: str, data: bytes) -> str:
    del content_type
    settings = get_settings()
    _validate_upload(file_name, data)
    object_key = f"reports/{uuid4().hex}{Path(file_name).suffix.lower()}"
    _write_local_object(settings.report_storage_dir, object_key, data)
    return object_key


def upload_drone_image(
    drone_id: str,
    image_type: str,
    file_name: str,
    content_type: str,
    data: bytes,
) -> str:
    del content_type
    settings = get_settings()
    _validate_drone_image_upload(file_name, data)
    object_key = (
        f"drones/{drone_id}/{image_type}/{uuid4().hex}"
        f"{Path(file_name).suffix.lower()}"
    )
    _write_local_object(settings.asset_storage_dir, object_key, data)
    return object_key


def upload_target_image(
    target_id: str,
    file_name: str,
    content_type: str,
    data: bytes,
) -> str:
    del content_type
    settings = get_settings()
    _validate_drone_image_upload(file_name, data)
    object_key = f"targets/{target_id}/{uuid4().hex}{Path(file_name).suffix.lower()}"
    _write_local_object(settings.asset_storage_dir, object_key, data)
    return object_key


def stream_drone_image(object_key: str) -> tuple[Iterator[bytes], str]:
    return _stream_local_object(
        get_settings().asset_storage_dir,
        object_key,
        error_code="DRONE_IMAGE_OBJECT_NOT_FOUND",
        error_message="Drone image object was not found.",
    )


def stream_target_image(object_key: str) -> tuple[Iterator[bytes], str]:
    return _stream_local_object(
        get_settings().asset_storage_dir,
        object_key,
        error_code="TARGET_IMAGE_OBJECT_NOT_FOUND",
        error_message="Target image object was not found.",
    )


def read_dataset_object(object_key: str) -> bytes:
    settings = get_settings()
    _validate_dataset_object_key(object_key)
    try:
        return _local_object_path(settings.dataset_storage_dir, object_key).read_bytes()
    except FileNotFoundError as error:
        raise AppError(
            "DATASET_OBJECT_NOT_FOUND",
            "Dataset object was not found.",
            status_code=404,
            details={"objectKey": object_key},
        ) from error


def stream_dataset_object(object_key: str) -> tuple[Iterator[bytes], str]:
    _validate_dataset_object_key(object_key)
    return _stream_local_object(
        get_settings().dataset_storage_dir,
        object_key,
        error_code="DATASET_OBJECT_NOT_FOUND",
        error_message="Dataset object was not found.",
    )


def delete_drone_image(object_key: str) -> None:
    _local_object_path(get_settings().asset_storage_dir, object_key).unlink(
        missing_ok=True
    )


def delete_target_image(object_key: str) -> None:
    delete_drone_image(object_key)


def check_required_buckets() -> None:
    settings = get_settings()
    for directory_name in (
        settings.dataset_storage_dir,
        settings.asset_storage_dir,
        settings.report_storage_dir,
    ):
        _local_directory_path(directory_name).mkdir(parents=True, exist_ok=True)


def stream_report_file(object_key: str) -> tuple[Iterator[bytes], str]:
    return _stream_local_object(
        get_settings().report_storage_dir,
        object_key,
        error_code="ATTACHMENT_OBJECT_NOT_FOUND",
        error_message="Attachment object was not found.",
    )


def _local_storage_root() -> Path:
    return Path(get_settings().local_storage_dir).resolve()


def _local_directory_path(directory_name: str) -> Path:
    return _local_storage_root() / directory_name


def _local_object_path(directory_name: str, object_key: str) -> Path:
    object_path = Path(object_key.replace("\\", "/"))
    if object_path.is_absolute() or ".." in object_path.parts:
        raise AppError("INVALID_OBJECT_KEY", "Invalid local object path.", status_code=400)

    root = _local_directory_path(directory_name).resolve()
    path = (root / object_path).resolve()
    if root not in path.parents and path != root:
        raise AppError("INVALID_OBJECT_KEY", "Invalid local object path.", status_code=400)
    return path


def _write_local_object(directory_name: str, object_key: str, data: bytes) -> None:
    path = _local_object_path(directory_name, object_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _stream_local_object(
    directory_name: str,
    object_key: str,
    *,
    error_code: str,
    error_message: str,
) -> tuple[Iterator[bytes], str]:
    path = _local_object_path(directory_name, object_key)
    if not path.exists() or not path.is_file():
        raise AppError(
            error_code,
            error_message,
            status_code=404,
            details={"objectKey": object_key},
        )

    content_type = guess_type(path.name)[0] or "application/octet-stream"

    def iter_chunks() -> Iterator[bytes]:
        with path.open("rb") as file:
            while chunk := file.read(64 * 1024):
                yield chunk

    return iter_chunks(), content_type


def _validate_dataset_object_key(object_key: str) -> None:
    settings = get_settings()
    allowed_prefixes = {
        f"{settings.drone_view_dataset_prefix.rstrip('/')}/",
        f"{settings.drone_view_jamming_dataset_prefix.rstrip('/')}/",
        f"{settings.drone_view_spoofing_dataset_prefix.rstrip('/')}/",
    }
    if settings.drone_view_drone_c_dataset_prefix:
        allowed_prefixes.add(
            f"{settings.drone_view_drone_c_dataset_prefix.rstrip('/')}/"
        )
    if (
        not any(object_key.startswith(prefix) for prefix in allowed_prefixes)
        or ".." in object_key.split("/")
    ):
        raise AppError(
            "INVALID_DATASET_OBJECT_KEY",
            "Invalid dataset object key.",
            status_code=400,
        )


def _validate_upload(file_name: str, data: bytes) -> None:
    settings = get_settings()
    extension = Path(file_name).suffix.lower()
    if extension not in settings.allowed_extensions:
        raise AppError(
            "UNSUPPORTED_FILE_EXTENSION",
            "Unsupported file extension.",
            status_code=400,
            details={"allowedExtensions": sorted(settings.allowed_extensions)},
        )

    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(data) > max_size_bytes:
        raise AppError(
            "UPLOAD_FILE_TOO_LARGE",
            "Uploaded file is too large.",
            status_code=413,
            details={"maxUploadSizeMb": settings.max_upload_size_mb},
        )


def _validate_drone_image_upload(file_name: str, data: bytes) -> None:
    settings = get_settings()
    allowed_image_extensions = {".jpg", ".jpeg", ".png", ".svg", ".webp"}
    extension = Path(file_name).suffix.lower()
    if extension not in allowed_image_extensions:
        raise AppError(
            "UNSUPPORTED_DRONE_IMAGE_EXTENSION",
            "Only PNG, JPG, SVG, and WEBP image files are allowed.",
            status_code=400,
            details={"allowedExtensions": sorted(allowed_image_extensions)},
        )

    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(data) > max_size_bytes:
        raise AppError(
            "DRONE_IMAGE_TOO_LARGE",
            "Drone image is too large.",
            status_code=413,
            details={"maxUploadSizeMb": settings.max_upload_size_mb},
        )
