"""Qwen2.5-VL로 객체 track 행동 설명과 텍스트 임베딩을 생성하는 CLI입니다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.vlm.action_analyzer import ActionAnalysisConfig, analyze_video_actions


def parse_args() -> argparse.Namespace:
    """행동 분석 실행에 필요한 명령행 인자를 파싱합니다."""

    parser = argparse.ArgumentParser(description="Analyze tracked object actions with Qwen2.5-VL.")
    parser.add_argument("--run-dir", required=True, help="Run directory containing metadata.jsonl.")
    parser.add_argument("--output-dir", help="Output directory. Defaults to RUN_DIR.")
    parser.add_argument("--model-name", default="Qwen/Qwen2.5-VL-7B-Instruct")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--image-source", choices=["frame", "crop"], default="frame")
    parser.add_argument("--label", help="Optional object label filter, for example person or car.")
    parser.add_argument("--max-tracks", type=int)
    parser.add_argument("--max-frames-per-track", type=int, default=6)
    parser.add_argument("--min-observations", type=int, default=2)
    parser.add_argument("--clip-model", default="ViT-B-32")
    parser.add_argument("--clip-pretrained", default="openai")
    return parser.parse_args()


def main() -> None:
    """행동 설명과 텍스트 임베딩 생성을 실행합니다."""

    args = parse_args()
    started_at = perf_counter()
    print("[ActionVLM] track 행동 분석 시작", flush=True)
    summary = analyze_video_actions(
        ActionAnalysisConfig(
            run_dir=args.run_dir,
            output_dir=args.output_dir,
            model_name=args.model_name,
            device=args.device,
            image_source=args.image_source,
            label=args.label,
            max_tracks=args.max_tracks,
            max_frames_per_track=args.max_frames_per_track,
            min_observations=args.min_observations,
            clip_model=args.clip_model,
            clip_pretrained=args.clip_pretrained,
        )
    )
    print(f"[ActionVLM] 완료: elapsed={perf_counter() - started_at:.1f}s", flush=True)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
