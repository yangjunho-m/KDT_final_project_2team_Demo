import { apiClient } from "./apiClient";
import { horizontalMetersBetween } from "../shared/utils/geo";
import type { Coordinate, ThreeDimensionalCoordinate } from "../shared/types";

/**
 * 백엔드 드론뷰 데이터셋의 "정상(계획) 경로" — 소스 드론별 전체 route(출발→도착) 좌표.
 * GET /api/drone-view/routes 는 프레임 전체(수천 개, 텔레메트리·이미지 포함)를 돌려주므로
 * 화면 렌더용으로는 좌표만 뽑아 거리 기준으로 다운샘플링해 가볍게 유지한다.
 *
 * 다운샘플된 프레임은 좌표뿐 아니라 해당 지점의 드론뷰 이미지 URL·고도까지 함께 담는다.
 * 이 덕분에 시나리오를 실행하지 않아도 (1) 드론이 있는 좌표에 맞는 드론뷰 이미지를 고르고,
 * (2) 이 좌표들을 웨이포인트로 삼아 드론을 정상 경로 그대로 이동시킬 수 있다.
 */

type RawRoutePosition = {
  latitude?: unknown;
  longitude?: unknown;
  altitude?: unknown;
};
type RawRouteFrame = { position?: RawRoutePosition; viewImageUrl?: unknown };
type RawRouteItem = {
  datasetSourceDroneId?: unknown;
  frames?: RawRouteFrame[];
};
type RawRoutesData = { items?: RawRouteItem[] };

/** 다운샘플된 정상 경로의 한 지점 — 좌표·고도·해당 지점 드론뷰 이미지. */
export type DroneViewRouteFrame = {
  latitude: number;
  longitude: number;
  altitude: number;
  viewImageUrl: string | null;
};

export type DroneViewRoute = {
  datasetSourceDroneId: string;
  /** 다운샘플링된 정상 경로 좌표 (출발→도착) — 폴리라인·출발점 매칭용 2D 좌표. */
  points: Coordinate[];
  /** 좌표와 같은 지점의 고도·드론뷰 이미지까지 담은 프레임 (이미지 선택·경로 이동용). */
  frames: DroneViewRouteFrame[];
};

// 폴리라인이 매끄럽고 가볍도록 이 간격보다 촘촘한 점은 건너뛴다(출발·도착점은 항상 유지).
const MIN_POINT_DISTANCE_METERS = 20;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function downsampleFrames(frames: RawRouteFrame[]): DroneViewRouteFrame[] {
  const valid: DroneViewRouteFrame[] = [];
  for (const frame of frames) {
    const latitude = finite(frame.position?.latitude);
    const longitude = finite(frame.position?.longitude);
    if (latitude === null || longitude === null) {
      continue;
    }
    valid.push({
      latitude,
      longitude,
      altitude: finite(frame.position?.altitude) ?? 0,
      viewImageUrl:
        typeof frame.viewImageUrl === "string" ? frame.viewImageUrl : null,
    });
  }
  if (valid.length === 0) {
    return [];
  }
  const kept: DroneViewRouteFrame[] = [valid[0]];
  let last = valid[0];
  for (let i = 1; i < valid.length; i += 1) {
    if (horizontalMetersBetween(last, valid[i]) >= MIN_POINT_DISTANCE_METERS) {
      kept.push(valid[i]);
      last = valid[i];
    }
  }
  // 도착 프레임(마지막)은 다운샘플에서 빠질 수 있어 명시적으로 포함한다.
  const arrival = valid[valid.length - 1];
  const tail = kept[kept.length - 1];
  if (tail.latitude !== arrival.latitude || tail.longitude !== arrival.longitude) {
    kept.push(arrival);
  }
  return kept;
}

export async function fetchDroneViewRoutes(options?: {
  signal?: AbortSignal;
}): Promise<DroneViewRoute[]> {
  const data = await apiClient.get<RawRoutesData>("/api/drone-view/routes", {
    signal: options?.signal,
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  const routes: DroneViewRoute[] = [];
  for (const item of items) {
    const id =
      typeof item.datasetSourceDroneId === "string"
        ? item.datasetSourceDroneId
        : null;
    const rawFrames = Array.isArray(item.frames) ? item.frames : [];
    if (!id || rawFrames.length === 0) {
      continue;
    }
    const frames = downsampleFrames(rawFrames);
    if (frames.length >= 2) {
      routes.push({
        datasetSourceDroneId: id,
        points: frames.map((frame) => ({
          latitude: frame.latitude,
          longitude: frame.longitude,
        })),
        frames,
      });
    }
  }
  return routes;
}

/**
 * 주어진 좌표에서 가장 가까운 경로 프레임의 드론뷰 이미지 URL을 고른다.
 * 시나리오 실행과 무관하게 "드론이 있는 좌표의 시점 이미지"를 계속 보여주는 데 쓴다.
 */
export function pickNearestRouteFrameImage(
  frames: DroneViewRouteFrame[],
  position: Coordinate,
): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    if (!frame.viewImageUrl) {
      continue;
    }
    const distance = horizontalMetersBetween(position, frame);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = frame.viewImageUrl;
    }
  }
  return best;
}

/** 경로 프레임을 3D 이동 웨이포인트로 변환한다(드론 제어 "경로 따라 이동"용). */
export function routeFramesToWaypoints(
  frames: DroneViewRouteFrame[],
): ThreeDimensionalCoordinate[] {
  return frames.map((frame) => ({
    latitude: frame.latitude,
    longitude: frame.longitude,
    altitude: frame.altitude,
  }));
}
