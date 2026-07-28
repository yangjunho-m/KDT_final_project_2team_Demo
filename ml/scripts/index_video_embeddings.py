"""이 모듈의 역할을 설명합니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.graph_rag.video_graph import GraphConfig, build_video_graph
from ml.utils.video_object_embedding_pipeline import PipelineConfig, process_video


def parse_args() -> argparse.Namespace:
    """parse_args 함수의 역할을 설명합니다."""

    parser = argparse.ArgumentParser(
        description="Detect, track, crop, and embed video frames and objects.",
    )
    parser.add_argument("--config", help="Optional JSON config path.")
    parser.add_argument("--video", help="Input video file path.")
    parser.add_argument("--output-dir")
    parser.add_argument("--detector-model")
    parser.add_argument("--tracker-config")
    parser.add_argument("--clip-model")
    parser.add_argument("--clip-pretrained")
    parser.add_argument("--device", help="auto, cpu, cuda, cuda:0, ...")
    parser.add_argument("--frame-sample-seconds", type=float)
    parser.add_argument("--confidence-threshold", type=float)
    parser.add_argument("--no-save-frames", action="store_true")
    parser.add_argument("--no-save-crops", action="store_true")
    parser.add_argument("--build-graph", action="store_true", help="Also build Graph RAG nodes and edges after embedding.")
    parser.add_argument("--graph-output-dir", help="Graph output directory. Defaults to RUN_DIR/graph.")
    parser.add_argument("--near-distance-ratio", type=float, default=1.5)
    return parser.parse_args()


def main() -> None:
    """main 함수의 역할을 설명합니다."""

    args = parse_args()
    config_values = load_config_values(args.config)
    config_values.update(
        {
            key: value
            for key, value in {
                "video_path": args.video,
                "output_dir": args.output_dir,
                "detector_model": args.detector_model,
                "tracker_config": args.tracker_config,
                "clip_model": args.clip_model,
                "clip_pretrained": args.clip_pretrained,
                "device": args.device,
                "frame_sample_seconds": args.frame_sample_seconds,
                "confidence_threshold": args.confidence_threshold,
            }.items()
            if value is not None
        }
    )
    if args.no_save_frames:
        config_values["save_frames"] = False
    if args.no_save_crops:
        config_values["save_crops"] = False
    if "video_path" not in config_values or not config_values["video_path"]:
        raise SystemExit("--video or config.video_path is required.")

    config_values["video_path"] = str(resolve_project_path(config_values["video_path"]))
    config_values["output_dir"] = str(resolve_project_path(config_values.get("output_dir", PipelineConfig.output_dir)))
    config = PipelineConfig(**config_values)
    summary = process_video(config)
    if args.build_graph:
        graph_summary = build_video_graph(
            GraphConfig(
                input_dir=summary["run_dir"],
                output_dir=args.graph_output_dir,
                near_distance_ratio=args.near_distance_ratio,
            )
        )
        summary["graph"] = graph_summary
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def load_config_values(config_path: str | None) -> dict:
    """load_config_values 함수의 역할을 설명합니다."""

    if not config_path:
        return {}
    with Path(config_path).open("r", encoding="utf-8") as file:
        return json.load(file)


def resolve_project_path(path_value: str) -> Path:
    """resolve_project_path 함수의 역할을 설명합니다."""

    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


if __name__ == "__main__":
    main()
