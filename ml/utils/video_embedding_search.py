"""저장된 영상 임베딩을 검색하고 결과 리포트를 생성하는 모듈입니다."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from html import escape
import json
from pathlib import Path
from typing import Any

import numpy as np

from ml.utils.video_object_embedding_pipeline import ClipImageEmbedder


@dataclass(frozen=True)
class SearchConfig:
    """영상 임베딩 검색에 필요한 설정값입니다."""

    run_dir: str
    query: str
    top_k: int = 5
    item_type: str | None = None
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "openai"
    device: str = "auto"
    vector_preview_length: int = 8


@dataclass(frozen=True)
class VideoSearchResult:
    """검색 순위와 장면 메타데이터를 담는 결과 객체입니다."""

    rank: int
    score: float
    record_id: str
    video_id: str
    item_type: str
    frame_index: int
    timestamp_seconds: float
    image_path: str
    embedding_path: str
    embedding_dim: int
    embedding_norm: float
    embedding_preview: list[float]
    source_run_dir: str | None = None
    frame_image_path: str | None = None
    label: str | None = None
    confidence: float | None = None
    track_id: int | None = None
    bbox_xyxy: list[int] | None = None


def search_video_embeddings(config: SearchConfig) -> list[VideoSearchResult]:
    """단일 실행 폴더 또는 상위 폴더의 임베딩을 검색합니다."""

    run_dir = Path(config.run_dir)
    metadata_paths = find_metadata_paths(run_dir)
    if not metadata_paths:
        raise FileNotFoundError(f"metadata.jsonl not found under: {run_dir}")
    if config.top_k < 1:
        raise ValueError("top_k must be greater than or equal to 1.")

    embedder = ClipImageEmbedder(
        model_name=config.clip_model,
        pretrained=config.clip_pretrained,
        device=config.device,
    )
    query_embedding = embedder.embed_text(config.query)
    rows = load_all_metadata(metadata_paths)

    scored_rows: list[tuple[float, dict[str, Any], np.ndarray]] = []
    for row in rows:
        if config.item_type and row["item_type"] != config.item_type:
            continue
        embedding = np.load(row["embedding_path"])
        score = cosine_similarity(query_embedding, embedding)
        scored_rows.append((score, row, embedding))

    scored_rows.sort(key=lambda item: item[0], reverse=True)
    return [
        build_search_result(
            rank=index + 1,
            score=score,
            row=row,
            embedding=embedding,
            vector_preview_length=config.vector_preview_length,
        )
        for index, (score, row, embedding) in enumerate(scored_rows[: config.top_k])
    ]


def find_metadata_paths(run_dir: Path) -> list[Path]:
    """find_metadata_paths 함수의 역할을 설명합니다."""

    direct_metadata_path = run_dir / "metadata.jsonl"
    if direct_metadata_path.exists():
        return [direct_metadata_path]
    return sorted(path for path in run_dir.rglob("metadata.jsonl") if path.is_file())


def build_llm_context(query: str, results: list[VideoSearchResult]) -> str:
    """Ollama가 근거로 사용할 검색 컨텍스트를 생성합니다."""

    result_lines = []
    for result in results:
        label_text = f", label={result.label}" if result.label else ""
        track_text = f", track_id={result.track_id}" if result.track_id is not None else ""
        bbox_text = f", bbox={result.bbox_xyxy}" if result.bbox_xyxy else ""
        image_filename = Path(result.image_path).name
        frame_filename = Path(result.frame_image_path).name if result.frame_image_path else image_filename
        run_text = f", run_dir={result.source_run_dir}" if result.source_run_dir else ""
        result_lines.append(
            f"{result.rank}. score={result.score:.4f}, frame_index={result.frame_index}, "
            f"time={result.timestamp_seconds:.3f}s, "
            f"type={result.item_type}{label_text}{track_text}{bbox_text}, "
            f"video_id={result.video_id}{run_text}, "
            f"frame_file={frame_filename}, matched_file={image_filename}, "
            f"image={result.image_path}, frame_image={result.frame_image_path or result.image_path}, "
            f"embedding_dim={result.embedding_dim}, "
            f"embedding_norm={result.embedding_norm:.4f}, "
            f"embedding_preview={result.embedding_preview}"
        )

    return "\n".join(
        [
            f"사용자 질문: {query}",
            "",
            "아래는 CLIP 텍스트 임베딩으로 질문을 벡터화한 뒤,",
            "저장된 프레임/객체 이미지 임베딩과 cosine similarity로 검색한 결과입니다.",
            "embedding_preview는 전체 벡터가 아니라 앞부분 일부 값입니다.",
            "",
            "\n".join(result_lines) if result_lines else "검색 결과가 없습니다.",
        ]
    )


def results_to_dicts(results: list[VideoSearchResult]) -> list[dict[str, Any]]:
    """results_to_dicts 함수의 역할을 설명합니다."""

    return [asdict(result) for result in results]


def load_all_metadata(metadata_paths: list[Path]) -> list[dict[str, Any]]:
    """load_all_metadata 함수의 역할을 설명합니다."""

    rows = []
    for metadata_path in metadata_paths:
        rows.extend(load_metadata(metadata_path))
    return rows


def load_metadata(metadata_path: Path) -> list[dict[str, Any]]:
    """load_metadata 함수의 역할을 설명합니다."""

    rows = []
    run_dir = metadata_path.parent
    with metadata_path.open("r", encoding="utf-8") as file:
        for line in file:
            if line.strip():
                row = json.loads(line)
                row["_source_run_dir"] = str(run_dir)
                row["image_path"] = str(resolve_record_path(run_dir, row["image_path"]))
                row["embedding_path"] = str(resolve_record_path(run_dir, row["embedding_path"]))
                row["_frame_image_path"] = str(find_frame_image_path(run_dir, row))
                rows.append(row)
    return rows


def resolve_record_path(run_dir: Path, path_value: str) -> Path:
    """resolve_record_path 함수의 역할을 설명합니다."""

    path = Path(path_value)
    if path.is_absolute():
        return path
    run_relative_path = run_dir / path
    if run_relative_path.exists():
        return run_relative_path
    return path


def find_frame_image_path(run_dir: Path, row: dict[str, Any]) -> Path:
    """find_frame_image_path 함수의 역할을 설명합니다."""

    if row.get("item_type") == "frame":
        return Path(row["image_path"])

    frame_index = row.get("frame_index")
    if frame_index is None:
        return Path(row["image_path"])

    frame_path = run_dir / "frames" / f"frame_{int(frame_index):06d}.jpg"
    return frame_path if frame_path.exists() else Path(row["image_path"])


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    """cosine_similarity 함수의 역할을 설명합니다."""

    left_norm = np.linalg.norm(left)
    right_norm = np.linalg.norm(right)
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return float(np.dot(left, right) / (left_norm * right_norm))


def build_search_result(
    rank: int,
    score: float,
    row: dict[str, Any],
    embedding: np.ndarray,
    vector_preview_length: int,
) -> VideoSearchResult:
    """build_search_result 함수의 역할을 설명합니다."""

    preview = embedding[:vector_preview_length].astype(float).round(6).tolist()
    return VideoSearchResult(
        rank=rank,
        score=round(score, 6),
        record_id=row["record_id"],
        video_id=row["video_id"],
        item_type=row["item_type"],
        frame_index=int(row["frame_index"]),
        timestamp_seconds=row["timestamp_seconds"],
        image_path=row["image_path"],
        embedding_path=row["embedding_path"],
        embedding_dim=int(embedding.shape[0]),
        embedding_norm=round(float(np.linalg.norm(embedding)), 6),
        embedding_preview=preview,
        source_run_dir=row.get("_source_run_dir"),
        frame_image_path=row.get("_frame_image_path"),
        label=row.get("label"),
        confidence=row.get("confidence"),
        track_id=row.get("track_id"),
        bbox_xyxy=row.get("bbox_xyxy"),
    )


def write_html_report(path: Path, query: str, results: list[VideoSearchResult]) -> Path:
    """매칭 이미지와 원본 프레임을 함께 보여주는 HTML 리포트를 저장합니다."""

    path.parent.mkdir(parents=True, exist_ok=True)
    rows = "\n".join(build_result_card(result) for result in results)
    empty_text = "<p>No results found.</p>" if not results else ""
    html = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Video Embedding Search Results</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #f7f7f5; color: #222; }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 28px 20px 44px; }}
    h1 {{ font-size: 24px; margin: 0 0 6px; }}
    .query {{ margin: 0 0 22px; color: #555; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }}
    .card {{ background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
    .media {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #ddd; }}
    figure {{ margin: 0; background: #eee; }}
    img {{ display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: contain; background: #111; }}
    figcaption {{ padding: 7px 9px; font-size: 12px; color: #555; background: #fff; }}
    .body {{ padding: 12px; }}
    .title {{ font-weight: 700; margin-bottom: 8px; }}
    dl {{ display: grid; grid-template-columns: 86px 1fr; gap: 6px 10px; margin: 0; font-size: 13px; }}
    dt {{ color: #666; }}
    dd {{ margin: 0; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
  <main>
    <h1>Video Embedding Search Results</h1>
    <p class="query">Query: {escape(query)}</p>
    {empty_text}
    <section class="grid">
      {rows}
    </section>
  </main>
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")
    return path


def build_result_card(result: VideoSearchResult) -> str:
    """build_result_card 함수의 역할을 설명합니다."""

    frame_image = image_tag(result.frame_image_path or result.image_path, "Frame")
    matched_image = image_tag(result.image_path, "Matched image")
    label = result.label or "-"
    confidence = f"{result.confidence:.3f}" if result.confidence is not None else "-"
    bbox = result.bbox_xyxy if result.bbox_xyxy else "-"
    return f"""<article class="card">
  <div class="media">
    {frame_image}
    {matched_image}
  </div>
  <div class="body">
    <div class="title">#{result.rank} score={result.score:.4f}</div>
    <dl>
      <dt>video</dt><dd>{escape(result.video_id)}</dd>
      <dt>type</dt><dd>{escape(result.item_type)}</dd>
      <dt>frame</dt><dd>{result.frame_index}</dd>
      <dt>time</dt><dd>{result.timestamp_seconds:.3f}s</dd>
      <dt>label</dt><dd>{escape(label)}</dd>
      <dt>confidence</dt><dd>{confidence}</dd>
      <dt>track</dt><dd>{result.track_id if result.track_id is not None else "-"}</dd>
      <dt>bbox</dt><dd>{escape(str(bbox))}</dd>
      <dt>run</dt><dd>{escape(result.source_run_dir or "-")}</dd>
    </dl>
  </div>
</article>"""


def image_tag(path_value: str, caption: str) -> str:
    """image_tag 함수의 역할을 설명합니다."""

    path = Path(path_value)
    src = path.resolve().as_uri() if path.exists() else path_value
    return f"""<figure>
  <img src="{escape(src)}" alt="{escape(caption)}">
  <figcaption>{escape(caption)}</figcaption>
</figure>"""
