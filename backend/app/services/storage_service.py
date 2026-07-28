from collections.abc import Iterator
from io import BytesIO
from mimetypes import guess_type
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.core.errors import AppError


def upload_report_file(file_name: str, content_type: str, data: bytes) -> str:
    settings = get_settings()
    _validate_upload(file_name, data)
    object_key = f"reports/{uuid4().hex}{Path(file_name).suffix.lower()}"
    client = _get_minio_client()
    _ensure_bucket(client, settings.minio_bucket_reports)
    client.put_object(
        settings.minio_bucket_reports,
        object_key,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_key


def upload_drone_image(drone_id: str, image_type: str, file_name: str, content_type: str, data: bytes) -> str:
    settings = get_settings()
    _validate_drone_image_upload(file_name, data)
    object_key = f"drones/{drone_id}/{image_type}/{uuid4().hex}{Path(file_name).suffix.lower()}"
    client = _get_minio_client()
    _ensure_bucket(client, settings.minio_bucket_assets)
    client.put_object(
        settings.minio_bucket_assets,
        object_key,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_key


def upload_target_image(target_id: str, file_name: str, content_type: str, data: bytes) -> str:
    settings = get_settings()
    _validate_drone_image_upload(file_name, data)
    object_key = f"targets/{target_id}/{uuid4().hex}{Path(file_name).suffix.lower()}"
    client = _get_minio_client()
    _ensure_bucket(client, settings.minio_bucket_assets)
    client.put_object(
        settings.minio_bucket_assets,
        object_key,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_key


def stream_drone_image(object_key: str) -> tuple[Iterator[bytes], str]:
    settings = get_settings()
    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket_assets, object_key)
    except Exception as error:
        raise AppError(
            "DRONE_IMAGE_OBJECT_NOT_FOUND",
            "드론 이미지 객체를 찾을 수 없습니다.",
            status_code=404,
        ) from error

    content_type = response.headers.get("Content-Type", "application/octet-stream")

    def iter_chunks() -> Iterator[bytes]:
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    return iter_chunks(), content_type


def stream_target_image(object_key: str) -> tuple[Iterator[bytes], str]:
    settings = get_settings()
    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket_assets, object_key)
    except Exception as error:
        raise AppError(
            "TARGET_IMAGE_OBJECT_NOT_FOUND",
            "표적 이미지 객체를 찾을 수 없습니다.",
            status_code=404,
        ) from error

    content_type = response.headers.get("Content-Type", "application/octet-stream")

    def iter_chunks() -> Iterator[bytes]:
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    return iter_chunks(), content_type


def read_dataset_object(object_key: str) -> bytes:
    settings = get_settings()
    _validate_dataset_object_key(object_key)
    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket_datasets, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
    except Exception as error:
        raise AppError(
            "DATASET_OBJECT_NOT_FOUND",
            "데이터셋 객체를 찾을 수 없습니다.",
            status_code=404,
            details={"objectKey": object_key},
        ) from error


def upload_satellite_image(object_key: str, data: bytes, content_type: str) -> None:
    """Upload a batch-indexed satellite image to the datasets bucket."""
    settings = get_settings()
    client = _get_minio_client()
    _ensure_bucket(client, settings.minio_bucket_datasets)
    client.put_object(
        settings.minio_bucket_datasets,
        object_key,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def read_satellite_image(object_key: str) -> bytes:
    settings = get_settings()
    prefix = f"{settings.faiss_satellite_prefix}/"
    if not object_key.startswith(prefix) or ".." in object_key.split("/"):
        raise AppError("INVALID_SATELLITE_OBJECT_KEY", "잘못된 위성 이미지 경로입니다.", 400)
    client = _get_minio_client()
    response = client.get_object(settings.minio_bucket_datasets, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def stream_dataset_object(object_key: str) -> tuple[Iterator[bytes], str]:
    settings = get_settings()
    _validate_dataset_object_key(object_key)
    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket_datasets, object_key)
    except Exception as error:
        raise AppError(
            "DATASET_OBJECT_NOT_FOUND",
            "데이터셋 객체를 찾을 수 없습니다.",
            status_code=404,
            details={"objectKey": object_key},
        ) from error

    content_type = response.headers.get("Content-Type", "application/octet-stream")
    if content_type == "application/octet-stream":
        content_type = guess_type(object_key)[0] or content_type

    def iter_chunks() -> Iterator[bytes]:
        try:
            for chunk in response.stream(64 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    return iter_chunks(), content_type


def delete_drone_image(object_key: str) -> None:
    settings = get_settings()
    client = _get_minio_client()
    try:
        client.remove_object(settings.minio_bucket_assets, object_key)
    except Exception:
        return


def delete_target_image(object_key: str) -> None:
    delete_drone_image(object_key)


def check_required_buckets() -> None:
    settings = get_settings()
    client = _get_minio_client()
    for bucket_name in (
        settings.minio_bucket_datasets,
        settings.minio_bucket_assets,
        settings.minio_bucket_reports,
    ):
        if not client.bucket_exists(bucket_name):
            raise RuntimeError(f"Required MinIO bucket does not exist: {bucket_name}")


def stream_report_file(object_key: str) -> tuple[Iterator[bytes], str]:
    settings = get_settings()
    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket_reports, object_key)
    except Exception as error:
        raise AppError(
            "ATTACHMENT_OBJECT_NOT_FOUND",
            "첨부파일 객체를 찾을 수 없습니다.",
            status_code=404,
        ) from error

    content_type = response.headers.get("Content-Type", "application/octet-stream")

    def iter_chunks() -> Iterator[bytes]:
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    return iter_chunks(), content_type


def _get_minio_client():
    from minio import Minio

    settings = get_settings()
    endpoint = settings.minio_endpoint.removeprefix("http://").removeprefix("https://")
    secure = settings.minio_endpoint.startswith("https://")
    return Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
    )


def _ensure_bucket(client, bucket_name: str) -> None:
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)


def _validate_dataset_object_key(object_key: str) -> None:
    settings = get_settings()
    allowed_prefixes = {
        f"{settings.drone_view_dataset_prefix.rstrip('/')}/",
        f"{settings.drone_view_jamming_dataset_prefix.rstrip('/')}/",
        f"{settings.drone_view_spoofing_dataset_prefix.rstrip('/')}/",
    }
    if settings.drone_view_drone_c_dataset_prefix:
        allowed_prefixes.add(f"{settings.drone_view_drone_c_dataset_prefix.rstrip('/')}/")
    if (
        not any(object_key.startswith(prefix) for prefix in allowed_prefixes)
        or ".." in object_key.split("/")
    ):
        raise AppError(
            "INVALID_DATASET_OBJECT_KEY",
            "허용되지 않은 데이터셋 객체 경로입니다.",
            status_code=400,
        )


def _validate_upload(file_name: str, data: bytes) -> None:
    settings = get_settings()
    extension = Path(file_name).suffix.lower()
    if extension not in settings.allowed_extensions:
        raise AppError(
            "UNSUPPORTED_FILE_EXTENSION",
            "허용되지 않는 파일 확장자입니다.",
            status_code=400,
            details={"allowedExtensions": sorted(settings.allowed_extensions)},
        )

    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(data) > max_size_bytes:
        raise AppError(
            "UPLOAD_FILE_TOO_LARGE",
            "업로드 파일 크기가 제한을 초과했습니다.",
            status_code=413,
            details={"maxUploadSizeMb": settings.max_upload_size_mb},
        )


def _validate_drone_image_upload(file_name: str, data: bytes) -> None:
    settings = get_settings()
    allowed_image_extensions = {".jpg", ".jpeg", ".png", ".svg"}
    extension = Path(file_name).suffix.lower()
    if extension not in allowed_image_extensions:
        raise AppError(
            "UNSUPPORTED_DRONE_IMAGE_EXTENSION",
            "드론 이미지는 PNG, JPG, SVG 파일만 업로드할 수 있습니다.",
            status_code=400,
            details={"allowedExtensions": sorted(allowed_image_extensions)},
        )

    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(data) > max_size_bytes:
        raise AppError(
            "DRONE_IMAGE_TOO_LARGE",
            "드론 이미지 크기가 제한을 초과했습니다.",
            status_code=413,
            details={"maxUploadSizeMb": settings.max_upload_size_mb},
        )
