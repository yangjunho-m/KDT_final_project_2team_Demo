"""영상 임베딩을 비지도 클러스터로 묶고 라벨링용 리포트를 생성합니다."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from html import escape
import json
from pathlib import Path
from typing import Any

import numpy as np

from ml.utils.video_embedding_search import find_metadata_paths, load_all_metadata


@dataclass(frozen=True)
class ClusterConfig:
    """영상 임베딩 클러스터링 실행에 필요한 설정값입니다."""

    input_dir: str
    output_dir: str | None = None
    num_clusters: int = 8
    item_type: str | None = None
    max_iterations: int = 100
    random_seed: int = 13
    representatives_per_cluster: int = 6


@dataclass(frozen=True)
class ClusterAssignment:
    """임베딩 한 건이 어떤 클러스터에 속하는지 나타내는 결과입니다."""

    cluster_id: int
    distance_to_centroid: float
    record_id: str
    video_id: str
    item_type: str
    frame_index: int
    timestamp_seconds: float
    image_path: str
    embedding_path: str
    source_run_dir: str | None = None
    frame_image_path: str | None = None
    label: str | None = None
    confidence: float | None = None
    track_id: int | None = None
    bbox_xyxy: list[int] | None = None


def cluster_video_embeddings(config: ClusterConfig) -> dict[str, Any]:
    """metadata와 임베딩을 읽어 클러스터링하고 결과 파일을 저장합니다."""

    input_dir = Path(config.input_dir)
    metadata_paths = find_metadata_paths(input_dir)
    if not metadata_paths:
        raise FileNotFoundError(f"metadata.jsonl not found under: {input_dir}")

    rows = filter_rows(load_all_metadata(metadata_paths), config.item_type)
    if not rows:
        raise ValueError("클러스터링할 임베딩 메타데이터가 없습니다.")

    vectors = load_embedding_matrix(rows)
    cluster_count = min(config.num_clusters, len(rows))
    labels, centroids = kmeans(
        vectors=vectors,
        cluster_count=cluster_count,
        max_iterations=config.max_iterations,
        random_seed=config.random_seed,
    )
    distances = calculate_distances_to_centroids(vectors, labels, centroids)
    assignments = build_cluster_assignments(rows, labels, distances)

    output_dir = resolve_output_dir(input_dir, config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    summary = build_cluster_summary(assignments, cluster_count)
    representative_assignments = select_representatives(assignments, config.representatives_per_cluster)

    assignments_path = output_dir / "cluster_assignments.jsonl"
    summary_path = output_dir / "cluster_summary.json"
    labels_path = output_dir / "cluster_labels.template.json"
    report_path = output_dir / "cluster_report.html"

    write_jsonl(assignments_path, [asdict(assignment) for assignment in assignments])
    write_json(summary_path, summary)
    write_json(labels_path, build_label_template(summary))
    write_cluster_report(report_path, representative_assignments, summary)

    return {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "metadata_count": len(metadata_paths),
        "embedding_count": len(rows),
        "cluster_count": cluster_count,
        "assignments_path": str(assignments_path),
        "summary_path": str(summary_path),
        "labels_path": str(labels_path),
        "report_path": str(report_path),
    }


def filter_rows(rows: list[dict[str, Any]], item_type: str | None) -> list[dict[str, Any]]:
    """item_type 필터가 있으면 해당 종류의 메타데이터만 남깁니다."""

    if item_type is None:
        return rows
    return [row for row in rows if row.get("item_type") == item_type]


def load_embedding_matrix(rows: list[dict[str, Any]]) -> np.ndarray:
    """메타데이터 행에 연결된 .npy 임베딩을 하나의 행렬로 읽습니다."""

    vectors = [np.load(row["embedding_path"]).astype("float32") for row in rows]
    return np.vstack(vectors)


def kmeans(
    vectors: np.ndarray,
    cluster_count: int,
    max_iterations: int,
    random_seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    """numpy만 사용해 결정적인 KMeans 클러스터링을 수행합니다."""

    if cluster_count < 1:
        raise ValueError("cluster_count must be greater than or equal to 1.")
    rng = np.random.default_rng(random_seed)
    initial_indices = rng.choice(len(vectors), size=cluster_count, replace=False)
    centroids = vectors[initial_indices].copy()
    labels = np.zeros(len(vectors), dtype=np.int64)

    for _ in range(max_iterations):
        distances = pairwise_squared_distances(vectors, centroids)
        next_labels = np.argmin(distances, axis=1)
        if np.array_equal(labels, next_labels):
            break
        labels = next_labels
        centroids = recompute_centroids(vectors, labels, centroids, rng)

    return labels, centroids


def pairwise_squared_distances(vectors: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    """각 벡터와 중심점 사이의 제곱 거리 행렬을 계산합니다."""

    diff = vectors[:, None, :] - centroids[None, :, :]
    return np.sum(diff * diff, axis=2)


def recompute_centroids(
    vectors: np.ndarray,
    labels: np.ndarray,
    centroids: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray:
    """라벨별 평균으로 중심점을 갱신하고 빈 클러스터는 임의 벡터로 채웁니다."""

    next_centroids = centroids.copy()
    for cluster_id in range(len(centroids)):
        cluster_vectors = vectors[labels == cluster_id]
        if len(cluster_vectors) == 0:
            next_centroids[cluster_id] = vectors[rng.integers(0, len(vectors))]
        else:
            next_centroids[cluster_id] = cluster_vectors.mean(axis=0)
    return next_centroids


def calculate_distances_to_centroids(
    vectors: np.ndarray,
    labels: np.ndarray,
    centroids: np.ndarray,
) -> np.ndarray:
    """각 임베딩이 자기 클러스터 중심에서 얼마나 떨어졌는지 계산합니다."""

    distances = pairwise_squared_distances(vectors, centroids)
    return np.sqrt(distances[np.arange(len(vectors)), labels])


def build_cluster_assignments(
    rows: list[dict[str, Any]],
    labels: np.ndarray,
    distances: np.ndarray,
) -> list[ClusterAssignment]:
    """메타데이터 행, 클러스터 라벨, 중심 거리로 저장용 결과를 만듭니다."""

    assignments = []
    for row, cluster_id, distance in zip(rows, labels, distances, strict=True):
        assignments.append(
            ClusterAssignment(
                cluster_id=int(cluster_id),
                distance_to_centroid=round(float(distance), 6),
                record_id=row["record_id"],
                video_id=row["video_id"],
                item_type=row["item_type"],
                frame_index=int(row["frame_index"]),
                timestamp_seconds=float(row["timestamp_seconds"]),
                image_path=row["image_path"],
                embedding_path=row["embedding_path"],
                source_run_dir=row.get("_source_run_dir"),
                frame_image_path=row.get("_frame_image_path"),
                label=row.get("label"),
                confidence=row.get("confidence"),
                track_id=row.get("track_id"),
                bbox_xyxy=row.get("bbox_xyxy"),
            )
        )
    return assignments


def build_cluster_summary(assignments: list[ClusterAssignment], cluster_count: int) -> dict[str, Any]:
    """클러스터별 개수와 대표 메타데이터를 요약합니다."""

    clusters = []
    for cluster_id in range(cluster_count):
        members = [assignment for assignment in assignments if assignment.cluster_id == cluster_id]
        labels = sorted({member.label for member in members if member.label})
        item_types = sorted({member.item_type for member in members})
        clusters.append(
            {
                "cluster_id": cluster_id,
                "count": len(members),
                "item_types": item_types,
                "labels": labels,
                "first_timestamp_seconds": min((m.timestamp_seconds for m in members), default=None),
                "last_timestamp_seconds": max((m.timestamp_seconds for m in members), default=None),
            }
        )
    return {"clusters": clusters}


def select_representatives(
    assignments: list[ClusterAssignment],
    representatives_per_cluster: int,
) -> dict[int, list[ClusterAssignment]]:
    """클러스터 중심에 가까운 항목을 대표 이미지로 선택합니다."""

    representatives: dict[int, list[ClusterAssignment]] = {}
    cluster_ids = sorted({assignment.cluster_id for assignment in assignments})
    for cluster_id in cluster_ids:
        members = [assignment for assignment in assignments if assignment.cluster_id == cluster_id]
        members.sort(key=lambda item: item.distance_to_centroid)
        representatives[cluster_id] = members[:representatives_per_cluster]
    return representatives


def build_label_template(summary: dict[str, Any]) -> list[dict[str, Any]]:
    """사람이 클러스터 이름을 붙일 수 있는 라벨 템플릿을 만듭니다."""

    return [
        {
            "cluster_id": cluster["cluster_id"],
            "label": "",
            "description": "",
            "sample_count": cluster["count"],
            "observed_labels": cluster["labels"],
        }
        for cluster in summary["clusters"]
    ]


def resolve_output_dir(input_dir: Path, output_dir: str | None) -> Path:
    """명시된 출력 폴더가 없으면 입력 폴더 아래 clusters 폴더를 사용합니다."""

    if output_dir:
        return Path(output_dir)
    return input_dir / "clusters"


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    """딕셔너리 목록을 JSON Lines 형식으로 저장합니다."""

    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: Path, data: Any) -> None:
    """JSON 파일을 보기 좋은 들여쓰기 형식으로 저장합니다."""

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_cluster_report(
    path: Path,
    representatives: dict[int, list[ClusterAssignment]],
    summary: dict[str, Any],
) -> Path:
    """클러스터별 대표 프레임을 볼 수 있는 HTML 리포트를 저장합니다."""

    cluster_summaries = {cluster["cluster_id"]: cluster for cluster in summary["clusters"]}
    sections = "\n".join(
        build_cluster_section(cluster_id, representatives[cluster_id], cluster_summaries[cluster_id])
        for cluster_id in sorted(representatives)
    )
    html = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Video Embedding Clusters</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #f6f7f4; color: #222; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px 20px 44px; }}
    h1 {{ font-size: 24px; margin: 0 0 18px; }}
    section {{ margin: 0 0 28px; }}
    h2 {{ font-size: 18px; margin: 0 0 6px; }}
    .meta {{ margin: 0 0 12px; color: #555; font-size: 13px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
    .card {{ background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
    img {{ display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: contain; background: #111; }}
    dl {{ display: grid; grid-template-columns: 78px 1fr; gap: 4px 8px; margin: 0; padding: 10px; font-size: 12px; }}
    dt {{ color: #666; }}
    dd {{ margin: 0; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
  <main>
    <h1>Video Embedding Clusters</h1>
    {sections}
  </main>
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")
    return path


def build_cluster_section(
    cluster_id: int,
    representatives: list[ClusterAssignment],
    summary: dict[str, Any],
) -> str:
    """클러스터 하나의 대표 이미지 섹션을 HTML로 렌더링합니다."""

    cards = "\n".join(build_assignment_card(assignment) for assignment in representatives)
    labels = ", ".join(summary["labels"]) if summary["labels"] else "-"
    return f"""<section>
  <h2>Cluster {cluster_id}</h2>
  <p class="meta">count={summary["count"]}, item_types={escape(str(summary["item_types"]))}, labels={escape(labels)}</p>
  <div class="grid">
    {cards}
  </div>
</section>"""


def build_assignment_card(assignment: ClusterAssignment) -> str:
    """대표 임베딩 한 건을 HTML 카드로 렌더링합니다."""

    src = image_source(assignment.frame_image_path or assignment.image_path)
    return f"""<article class="card">
  <img src="{escape(src)}" alt="cluster sample">
  <dl>
    <dt>frame</dt><dd>{assignment.frame_index}</dd>
    <dt>time</dt><dd>{assignment.timestamp_seconds:.3f}s</dd>
    <dt>type</dt><dd>{escape(assignment.item_type)}</dd>
    <dt>label</dt><dd>{escape(assignment.label or "-")}</dd>
    <dt>track</dt><dd>{assignment.track_id if assignment.track_id is not None else "-"}</dd>
    <dt>distance</dt><dd>{assignment.distance_to_centroid:.4f}</dd>
  </dl>
</article>"""


def image_source(path_value: str) -> str:
    """로컬 이미지 경로를 브라우저에서 열 수 있는 URI로 변환합니다."""

    path = Path(path_value)
    return path.resolve().as_uri() if path.exists() else path_value
