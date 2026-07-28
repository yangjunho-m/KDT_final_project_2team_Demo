"""Qwen2.5-VL 모델로 이미지 묶음에 대한 텍스트 설명을 생성합니다."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class QwenVLConfig:
    """Qwen2.5-VL 로컬 추론에 필요한 설정값입니다."""

    model_name: str = "Qwen/Qwen2.5-VL-7B-Instruct"
    device: str = "cuda"
    max_new_tokens: int = 160


class QwenVLClient:
    """Qwen2.5-VL 모델과 processor를 보관하고 프레임 묶음 설명을 생성합니다."""

    def __init__(self, config: QwenVLConfig) -> None:
        """Qwen2.5-VL 모델을 로드합니다."""

        try:
            import torch
            from qwen_vl_utils import process_vision_info
            from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        except ImportError as exc:
            raise RuntimeError(
                "Qwen2.5-VL action analysis requires transformers, accelerate, and qwen-vl-utils."
            ) from exc

        self.config = config
        self.torch = torch
        self.process_vision_info = process_vision_info
        self.processor = AutoProcessor.from_pretrained(config.model_name)
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            config.model_name,
            torch_dtype=torch.float16 if config.device.startswith("cuda") else torch.float32,
            device_map="auto" if config.device.startswith("cuda") else None,
        )
        if not config.device.startswith("cuda"):
            self.model.to(config.device)
        self.model.eval()

    def describe_images(self, image_paths: list[str], prompt: str) -> str:
        """여러 이미지와 프롬프트를 모델에 전달하고 설명 텍스트를 반환합니다."""

        content = [{"type": "image", "image": Path(path).resolve().as_uri()} for path in image_paths]
        content.append({"type": "text", "text": prompt})
        messages = [{"role": "user", "content": content}]

        text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        image_inputs, video_inputs = self.process_vision_info(messages)
        inputs = self.processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to(self.model.device)
        with self.torch.no_grad():
            generated_ids = self.model.generate(**inputs, max_new_tokens=self.config.max_new_tokens)

        generated_ids_trimmed = [
            output_ids[len(input_ids) :] for input_ids, output_ids in zip(inputs.input_ids, generated_ids, strict=True)
        ]
        outputs = self.processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )
        return outputs[0].strip()
