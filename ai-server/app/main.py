"""이 모듈의 역할을 설명합니다."""

from fastapi import FastAPI

from app.api.video_search import router as video_search_router


app = FastAPI(title="Acorn Video Search AI Server")
app.include_router(video_search_router, prefix="/api/v1")


@app.get("/health")
def health_check() -> dict[str, str]:
    """health_check 함수의 역할을 설명합니다."""

    return {"status": "ok"}
