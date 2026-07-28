"""영상 임베딩 메타데이터를 Graph RAG용 노드와 엣지로 변환합니다."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

from ml.utils.video_embedding_search import find_metadata_paths, load_all_metadata


@dataclass(frozen=True)
class GraphConfig:
    """영상 그래프 생성에 필요한 설정값입니다."""

    input_dir: str
    output_dir: str | None = None
    near_distance_ratio: float = 1.5


@dataclass(frozen=True)
class GraphNode:
    """Graph RAG 검색에 사용할 그래프 노드입니다."""

    node_id: str
    node_type: str
    label: str
    properties: dict[str, Any]


@dataclass(frozen=True)
class GraphEdge:
    """Graph RAG 검색에 사용할 그래프 관계입니다."""

    source_id: str
    relation: str
    target_id: str
    properties: dict[str, Any]


def build_video_graph(config: GraphConfig) -> dict[str, Any]:
    """metadata.jsonl을 읽어 Graph RAG용 노드와 엣지 파일을 생성합니다."""

    input_dir = Path(config.input_dir)
    metadata_paths = find_metadata_paths(input_dir)
    if not metadata_paths:
        raise FileNotFoundError(f"metadata.jsonl not found under: {input_dir}")

    rows = load_all_metadata(metadata_paths)
    output_dir = resolve_graph_output_dir(input_dir, config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    nodes, edges = build_graph(rows, config.near_distance_ratio)
    action_events = load_action_events(input_dir, metadata_paths)
    add_action_events_to_graph(nodes, edges, action_events)
    nodes_path = output_dir / "graph_nodes.jsonl"
    edges_path = output_dir / "graph_edges.jsonl"
    summary_path = output_dir / "graph_summary.json"

    write_jsonl(nodes_path, [asdict(node) for node in sorted(nodes.values(), key=lambda item: item.node_id)])
    write_jsonl(edges_path, [asdict(edge) for edge in edges])
    summary = build_graph_summary(nodes, edges)
    write_json(summary_path, summary)

    return {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "metadata_count": len(metadata_paths),
        "action_event_count": len(action_events),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes_path": str(nodes_path),
        "edges_path": str(edges_path),
        "summary_path": str(summary_path),
    }


def build_graph(rows: list[dict[str, Any]], near_distance_ratio: float) -> tuple[dict[str, GraphNode], list[GraphEdge]]:
    """메타데이터 행 목록에서 노드와 관계를 구성합니다."""

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    for row in rows:
        video_id = row["video_id"]
        frame_index = int(row["frame_index"])
        video_node_id = build_video_node_id(video_id)
        frame_node_id = build_frame_node_id(video_id, frame_index)

        add_node(nodes, GraphNode(video_node_id, "video", video_id, {"video_id": video_id}))
        add_node(
            nodes,
            GraphNode(
                frame_node_id,
                "frame",
                f"{video_id}:frame_{frame_index:06d}",
                {
                    "video_id": video_id,
                    "frame_index": frame_index,
                    "timestamp_seconds": row["timestamp_seconds"],
                    "image_path": row.get("_frame_image_path") or row["image_path"],
                    "source_run_dir": row.get("_source_run_dir"),
                },
            ),
        )
        edges.append(GraphEdge(video_node_id, "contains_frame", frame_node_id, {"frame_index": frame_index}))

        if row["item_type"] != "object":
            continue

        object_node_id = build_object_node_id(row)
        add_node(nodes, build_object_node(row, object_node_id))
        edges.append(GraphEdge(frame_node_id, "contains_object", object_node_id, {"frame_index": frame_index}))

        label = row.get("label") or "unknown"
        label_node_id = build_label_node_id(label)
        add_node(nodes, GraphNode(label_node_id, "label", label, {"label": label}))
        edges.append(GraphEdge(object_node_id, "has_label", label_node_id, {}))

        if row.get("track_id") is not None:
            track_node_id = build_track_node_id(video_id, label, int(row["track_id"]))
            add_node(
                nodes,
                GraphNode(
                    track_node_id,
                    "track",
                    f"{label}:track_{row['track_id']}",
                    {"video_id": video_id, "label": label, "track_id": int(row["track_id"])},
                ),
            )
            edges.append(GraphEdge(object_node_id, "belongs_to_track", track_node_id, {}))
            edges.append(GraphEdge(track_node_id, "observed_as", object_node_id, {"frame_index": frame_index}))

    edges.extend(build_temporal_edges(rows))
    edges.extend(build_spatial_edges(rows, near_distance_ratio))
    return nodes, dedupe_edges(edges)


def load_action_events(input_dir: Path, metadata_paths: list[Path]) -> list[dict[str, Any]]:
    """run 폴더에 저장된 action_events.jsonl 파일들을 읽습니다."""

    candidate_paths = []
    direct_path = input_dir / "action_events.jsonl"
    if direct_path.exists():
        candidate_paths.append(direct_path)
    for metadata_path in metadata_paths:
        event_path = metadata_path.parent / "action_events.jsonl"
        if event_path.exists():
            candidate_paths.append(event_path)

    events = []
    for path in sorted(set(candidate_paths)):
        events.extend(read_jsonl(path))
    return events


def add_action_events_to_graph(
    nodes: dict[str, GraphNode],
    edges: list[GraphEdge],
    action_events: list[dict[str, Any]],
) -> None:
    """행동 분석 결과를 event 노드와 track/object/frame 관계로 그래프에 추가합니다."""

    for event in action_events:
        event_node_id = build_action_event_node_id(event["event_id"])
        add_node(
            nodes,
            GraphNode(
                event_node_id,
                "action_event",
                event["description"],
                {
                    "event_id": event["event_id"],
                    "video_id": event["video_id"],
                    "label": event["label"],
                    "track_id": event["track_id"],
                    "start_frame": event["start_frame"],
                    "end_frame": event["end_frame"],
                    "start_time": event["start_time"],
                    "end_time": event["end_time"],
                    "description": event["description"],
                    "embedding_path": event["embedding_path"],
                },
            ),
        )
        track_node_id = build_track_node_id(event["video_id"], event["label"], int(event["track_id"]))
        if track_node_id in nodes:
            edges.append(GraphEdge(track_node_id, "has_action_event", event_node_id, {}))
            edges.append(GraphEdge(event_node_id, "describes_track", track_node_id, {}))
        for record_id in event.get("evidence_record_ids", []):
            object_node_id = f"object:{record_id}"
            if object_node_id in nodes:
                edges.append(GraphEdge(event_node_id, "uses_evidence_object", object_node_id, {}))
        for frame_index in {int(event["start_frame"]), int(event["end_frame"])}:
            frame_node_id = build_frame_node_id(event["video_id"], frame_index)
            if frame_node_id in nodes:
                edges.append(GraphEdge(event_node_id, "has_evidence_frame", frame_node_id, {"frame_index": frame_index}))


def add_node(nodes: dict[str, GraphNode], node: GraphNode) -> None:
    """같은 ID의 노드가 없을 때만 노드를 추가합니다."""

    nodes.setdefault(node.node_id, node)


def build_object_node(row: dict[str, Any], object_node_id: str) -> GraphNode:
    """객체 메타데이터 행을 객체 노드로 변환합니다."""

    label = row.get("label") or "unknown"
    return GraphNode(
        object_node_id,
        "object",
        f"{label}@frame_{int(row['frame_index']):06d}",
        {
            "record_id": row["record_id"],
            "video_id": row["video_id"],
            "label": label,
            "confidence": row.get("confidence"),
            "track_id": row.get("track_id"),
            "bbox_xyxy": row.get("bbox_xyxy"),
            "frame_index": int(row["frame_index"]),
            "timestamp_seconds": row["timestamp_seconds"],
            "image_path": row["image_path"],
            "frame_image_path": row.get("_frame_image_path"),
            "embedding_path": row["embedding_path"],
            "source_run_dir": row.get("_source_run_dir"),
        },
    )


def build_temporal_edges(rows: list[dict[str, Any]]) -> list[GraphEdge]:
    """같은 track_id 객체 관측치를 시간 순서대로 연결합니다."""

    tracks: dict[tuple[str, str, int], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("item_type") == "object" and row.get("track_id") is not None:
            key = (row["video_id"], row.get("label") or "unknown", int(row["track_id"]))
            tracks[key].append(row)

    edges: list[GraphEdge] = []
    for track_rows in tracks.values():
        track_rows.sort(key=lambda item: int(item["frame_index"]))
        for before, after in zip(track_rows, track_rows[1:], strict=False):
            edges.append(
                GraphEdge(
                    build_object_node_id(before),
                    "next_observation",
                    build_object_node_id(after),
                    {
                        "from_frame": int(before["frame_index"]),
                        "to_frame": int(after["frame_index"]),
                        "from_time": before["timestamp_seconds"],
                        "to_time": after["timestamp_seconds"],
                    },
                )
            )
    return edges


def build_spatial_edges(rows: list[dict[str, Any]], near_distance_ratio: float) -> list[GraphEdge]:
    """같은 프레임 안 객체 사이의 overlap과 near 관계를 생성합니다."""

    frame_groups: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("item_type") == "object" and row.get("bbox_xyxy"):
            frame_groups[(row["video_id"], int(row["frame_index"]))].append(row)

    edges: list[GraphEdge] = []
    for frame_rows in frame_groups.values():
        for index, left in enumerate(frame_rows):
            for right in frame_rows[index + 1 :]:
                relation = spatial_relation(left["bbox_xyxy"], right["bbox_xyxy"], near_distance_ratio)
                if relation is None:
                    continue
                properties = {
                    "frame_index": int(left["frame_index"]),
                    "timestamp_seconds": left["timestamp_seconds"],
                    "left_label": left.get("label") or "unknown",
                    "right_label": right.get("label") or "unknown",
                }
                edges.append(GraphEdge(build_object_node_id(left), relation, build_object_node_id(right), properties))
                edges.append(GraphEdge(build_object_node_id(right), relation, build_object_node_id(left), properties))
    return edges


def spatial_relation(left_bbox: list[int], right_bbox: list[int], near_distance_ratio: float) -> str | None:
    """두 bbox가 겹치거나 가까운지 판단해 관계 이름을 반환합니다."""

    if boxes_overlap(left_bbox, right_bbox):
        return "overlaps"
    left_size = max(box_width(left_bbox), box_height(left_bbox))
    right_size = max(box_width(right_bbox), box_height(right_bbox))
    threshold = max(left_size, right_size) * near_distance_ratio
    return "near" if center_distance(left_bbox, right_bbox) <= threshold else None


def boxes_overlap(left: list[int], right: list[int]) -> bool:
    """두 xyxy bbox가 겹치는지 확인합니다."""

    return left[0] < right[2] and right[0] < left[2] and left[1] < right[3] and right[1] < left[3]


def center_distance(left: list[int], right: list[int]) -> float:
    """두 bbox 중심점 사이의 거리를 계산합니다."""

    lx, ly = box_center(left)
    rx, ry = box_center(right)
    return ((lx - rx) ** 2 + (ly - ry) ** 2) ** 0.5


def box_center(bbox: list[int]) -> tuple[float, float]:
    """xyxy bbox 중심 좌표를 반환합니다."""

    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def box_width(bbox: list[int]) -> int:
    """xyxy bbox 너비를 반환합니다."""

    return max(0, bbox[2] - bbox[0])


def box_height(bbox: list[int]) -> int:
    """xyxy bbox 높이를 반환합니다."""

    return max(0, bbox[3] - bbox[1])


def dedupe_edges(edges: list[GraphEdge]) -> list[GraphEdge]:
    """중복 관계를 제거합니다."""

    seen = set()
    unique_edges = []
    for edge in edges:
        key = (edge.source_id, edge.relation, edge.target_id, json.dumps(edge.properties, sort_keys=True))
        if key in seen:
            continue
        seen.add(key)
        unique_edges.append(edge)
    return unique_edges


def load_graph(graph_dir: Path) -> tuple[dict[str, GraphNode], list[GraphEdge]]:
    """저장된 그래프 노드와 엣지 파일을 읽습니다."""

    nodes_path = graph_dir / "graph_nodes.jsonl"
    edges_path = graph_dir / "graph_edges.jsonl"
    if not nodes_path.exists() or not edges_path.exists():
        raise FileNotFoundError(f"Graph files not found under: {graph_dir}")
    nodes = {row["node_id"]: GraphNode(**row) for row in read_jsonl(nodes_path)}
    edges = [GraphEdge(**row) for row in read_jsonl(edges_path)]
    return nodes, edges


def build_graph_context(
    graph_dir: Path,
    seed_record_ids: list[str],
    max_depth: int = 2,
    max_edges: int = 40,
) -> str:
    """검색 결과 record_id 주변의 그래프 관계를 LLM 컨텍스트 문자열로 만듭니다."""

    nodes, edges = load_graph(graph_dir)
    object_ids = [node_id for node_id, node in nodes.items() if node.properties.get("record_id") in seed_record_ids]
    if not object_ids:
        return "그래프에서 검색 결과와 연결된 객체 노드를 찾지 못했습니다."

    adjacency = build_adjacency(edges)
    visited = set(object_ids)
    queue = deque((node_id, 0) for node_id in object_ids)
    selected_edges: list[GraphEdge] = []

    while queue and len(selected_edges) < max_edges:
        node_id, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for edge in adjacency.get(node_id, []):
            selected_edges.append(edge)
            if len(selected_edges) >= max_edges:
                break
            if edge.target_id not in visited:
                visited.add(edge.target_id)
                queue.append((edge.target_id, depth + 1))

    return format_graph_context(nodes, selected_edges)


def build_adjacency(edges: list[GraphEdge]) -> dict[str, list[GraphEdge]]:
    """그래프 엣지를 source_id 기준 인접 리스트로 묶습니다."""

    adjacency: dict[str, list[GraphEdge]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source_id].append(edge)
    return adjacency


def format_graph_context(nodes: dict[str, GraphNode], edges: list[GraphEdge]) -> str:
    """선택된 그래프 관계를 LLM이 읽기 쉬운 텍스트로 변환합니다."""

    lines = ["그래프 관계 근거:"]
    for index, edge in enumerate(edges, start=1):
        source = nodes.get(edge.source_id)
        target = nodes.get(edge.target_id)
        if source is None or target is None:
            continue
        lines.append(
            f"{index}. {source.node_type}:{source.label} "
            f"-[{edge.relation}]-> {target.node_type}:{target.label}, "
            f"properties={edge.properties}"
        )
    return "\n".join(lines)


def build_graph_summary(nodes: dict[str, GraphNode], edges: list[GraphEdge]) -> dict[str, Any]:
    """노드/엣지 타입별 개수를 요약합니다."""

    node_counts: dict[str, int] = defaultdict(int)
    edge_counts: dict[str, int] = defaultdict(int)
    for node in nodes.values():
        node_counts[node.node_type] += 1
    for edge in edges:
        edge_counts[edge.relation] += 1
    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "node_counts": dict(sorted(node_counts.items())),
        "edge_counts": dict(sorted(edge_counts.items())),
    }


def resolve_graph_output_dir(input_dir: Path, output_dir: str | None) -> Path:
    """출력 폴더가 없으면 입력 폴더 아래 graph 폴더를 사용합니다."""

    if output_dir:
        return Path(output_dir)
    return input_dir / "graph"


def build_video_node_id(video_id: str) -> str:
    """video 노드 ID를 생성합니다."""

    return f"video:{video_id}"


def build_frame_node_id(video_id: str, frame_index: int) -> str:
    """frame 노드 ID를 생성합니다."""

    return f"frame:{video_id}:{frame_index:06d}"


def build_object_node_id(row: dict[str, Any]) -> str:
    """object 노드 ID를 생성합니다."""

    return f"object:{row['record_id']}"


def build_track_node_id(video_id: str, label: str, track_id: int) -> str:
    """track 노드 ID를 생성합니다."""

    return f"track:{video_id}:{label}:{track_id}"


def build_label_node_id(label: str) -> str:
    """label 노드 ID를 생성합니다."""

    return f"label:{label}"


def build_action_event_node_id(event_id: str) -> str:
    """action_event 노드 ID를 생성합니다."""

    return f"action_event:{event_id}"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    """JSON Lines 파일을 딕셔너리 목록으로 읽습니다."""

    rows = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    """딕셔너리 목록을 JSON Lines 형식으로 저장합니다."""

    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: Path, data: Any) -> None:
    """JSON 파일을 들여쓰기 형식으로 저장합니다."""

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
