import { z } from "zod";

export const enemyAreaCreateSchema = z.object({
  name: z.string().trim().min(1, "작전지역 이름을 입력하세요."),
  latitude: z
    .number({ error: "위도를 입력하세요." })
    .min(-90, "위도는 -90 이상이어야 합니다.")
    .max(90, "위도는 90 이하여야 합니다."),
  longitude: z
    .number({ error: "경도를 입력하세요." })
    .min(-180, "경도는 -180 이상이어야 합니다.")
    .max(180, "경도는 180 이하여야 합니다."),
  radiusMeters: z
    .number({ error: "반경을 입력하세요." })
    .positive("반경은 0보다 커야 합니다."),
});

export type EnemyAreaCreateFormValues = z.infer<typeof enemyAreaCreateSchema>;
