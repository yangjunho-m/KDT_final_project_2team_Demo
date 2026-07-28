import { useState, type FormEvent } from "react";
import type { EnemyAreaCreateInput } from "../../../shared/types";
import {
  NumberInput,
  PrimaryButton,
  TextInput,
} from "../../../shared/components";
import "./area-components.css";

export type AreaCreateFormProps = {
  onCreate: (input: EnemyAreaCreateInput) => void;
  isSubmitting?: boolean;
};

const emptyForm = {
  name: "",
  latitude: "",
  longitude: "",
  radiusMeters: "",
};

export function AreaCreateForm({ onCreate, isSubmitting }: AreaCreateFormProps) {
  const [form, setForm] = useState(emptyForm);

  const isValid =
    form.name.trim().length > 0 &&
    form.latitude.trim().length > 0 &&
    form.longitude.trim().length > 0 &&
    form.radiusMeters.trim().length > 0 &&
    isSubmitting !== true;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    onCreate({
      name: form.name.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radiusMeters: Number(form.radiusMeters),
    });
    setForm(emptyForm);
  };

  return (
    <form className="area-create-form" onSubmit={handleSubmit}>
      <TextInput
        label="작전지역 이름"
        required
        placeholder="예: 북서 작전지역"
        value={form.name}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, name: event.target.value }))
        }
      />
      <div className="area-create-form__row">
        <NumberInput
          label="위도"
          required
          step="any"
          placeholder="37.5665"
          value={form.latitude}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, latitude: event.target.value }))
          }
        />
        <NumberInput
          label="경도"
          required
          step="any"
          placeholder="126.9780"
          value={form.longitude}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, longitude: event.target.value }))
          }
        />
      </div>
      <NumberInput
        label="반경"
        unit="m"
        required
        min={0}
        placeholder="500"
        value={form.radiusMeters}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, radiusMeters: event.target.value }))
        }
      />
      <div className="area-create-form__actions">
        <PrimaryButton type="submit" disabled={!isValid}>
          {isSubmitting ? "생성 중..." : "작전지역 생성"}
        </PrimaryButton>
      </div>
    </form>
  );
}
