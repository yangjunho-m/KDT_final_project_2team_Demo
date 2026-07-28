import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ImageFallback, StatusBadge } from "../../shared/components";
import { DEFAULT_DRONE_CARD_IMAGE_PATH } from "../../shared/constants";
import { toDroneViewModel } from "../../shared/utils";
import { horizontalMetersBetween } from "../../shared/utils/geo";
import { pickNearestRouteFrameImage } from "../../api";
import {
  useDroneViewRoutesQuery,
  useOperationSnapshotQuery,
} from "../../features/operation/hooks";
import {
  selectRealtimeDroneView,
  useDroneViewRealtimeSync,
  useRealtimeConnection,
  useRealtimeDroneView,
  type DroneViewPlaybackStatus,
} from "../../features/realtime";
import { useAuthStore } from "../../stores";
import "./drone-view-window.css";

// 드론 출발 좌표가 이 거리 안이면 그 데이터셋 route를 이 드론의 정상 경로로 본다(OperationPage와 동일 기준).
const ROUTE_MATCH_TOLERANCE_METERS = 60;

function describeLiveBadge(
  hasLiveFrame: boolean,
  status: DroneViewPlaybackStatus | null,
  isRoutePreview: boolean,
): string {
  if (isRoutePreview) {
    return "● 정상경로";
  }
  if (!hasLiveFrame) {
    return "● LIVE · 시뮬레이션";
  }
  if (status === "completed") {
    return "● 재생 종료";
  }
  if (status === "failed") {
    return "● 재생 실패";
  }
  return "● LIVE";
}

/**
 * 드론뷰 전용 독립 창 (window.open 대상).
 * OperationPage의 "드론뷰 크게 보기"가 새 브라우저 창으로 이 페이지를 연다.
 * areaId/droneId 쿼리로 스냅샷을 조회해 해당 드론의 시점 화면을 크게 표시한다.
 *
 * 별도 브라우저 창이라 메인 창의 realtime 스토어(WebSocket 연결)를 공유하지
 * 않는다 — 이 창이 직접 WebSocket을 연결해 같은 DRONE_VIEW_FRAME_UPDATED
 * 이벤트를 독립적으로 구독하고, 백엔드가 시나리오 시작 시 자동 재생하는
 * 드론뷰 프레임을 여기서도 그대로 라이브로 보여준다.
 */
export function DroneViewWindowPage() {
  const [searchParams] = useSearchParams();
  const areaId = searchParams.get("areaId");
  const droneId = searchParams.get("droneId");
  // 이 창은 RequireAuth로 감싸지 않는다(router.tsx 참고) — 별도 브라우저 창이라
  // 세션 만료 시 전체 로그인 화면으로 튕기면 어색하다. 대신 인증 상태를 직접 확인해
  // 안내만 표시하고, 메인 창에서 다시 로그인하도록 유도한다.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const snapshotQuery = useOperationSnapshotQuery(areaId);
  const drone =
    snapshotQuery.data?.drones.find((item) => item.id === droneId) ?? null;
  // 시나리오 라이브 프레임이 없을 때 보여줄 정상 경로 프레임 이미지(드론 출발 좌표로 route 매칭).
  const droneViewRoutesQuery = useDroneViewRoutesQuery();

  const droneViewRealtimeSync = useDroneViewRealtimeSync({
    currentAreaId: areaId,
  });
  useRealtimeConnection(areaId, {
    onEvent: (event) => {
      try {
        droneViewRealtimeSync(event);
      } catch {
        // Drone view sync must not crash this standalone window.
      }
    },
  });
  const droneViewSnapshot = useRealtimeDroneView();
  const liveView =
    areaId && droneId
      ? selectRealtimeDroneView(droneViewSnapshot, areaId, droneId)
      : undefined;
  const liveImageUrl = liveView?.viewImageUrl ? liveView.viewImageUrl : null;
  const liveStatus = liveView?.status ?? null;

  useEffect(() => {
    document.title = drone ? `${drone.name} · 드론뷰` : "드론뷰";
  }, [drone]);

  if (!isAuthenticated) {
    return (
      <div className="drone-window">
        <EmptyState
          title="세션이 만료되었습니다."
          description="이 창은 별도 브라우저 창입니다. 메인 창에서 다시 로그인한 뒤 드론뷰를 다시 열어주세요."
        />
      </div>
    );
  }

  if (!areaId || !droneId) {
    return (
      <div className="drone-window">
        <EmptyState
          title="드론 정보가 지정되지 않았습니다."
          description="관제 화면에서 드론을 선택한 뒤 다시 열어주세요."
        />
      </div>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <div className="drone-window">
        <EmptyState
          title="드론뷰를 불러오는 중입니다."
          description="드론 상태를 확인하고 있습니다."
        />
      </div>
    );
  }

  if (!drone) {
    return (
      <div className="drone-window">
        <EmptyState
          title="드론을 찾을 수 없습니다."
          description="드론이 배정 해제되었거나 작전지역이 변경되었을 수 있습니다."
        />
      </div>
    );
  }

  const view = toDroneViewModel(drone);
  const coord = drone.currentPosition;

  // 라이브 프레임이 없으면 드론 현재 좌표에 가장 가까운 정상 경로 프레임 이미지를 쓴다.
  let routeImageUrl: string | null = null;
  if (!liveImageUrl) {
    const routes = droneViewRoutesQuery.data ?? [];
    let bestRoute: (typeof routes)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const route of routes) {
      const distance = horizontalMetersBetween(
        drone.departurePosition,
        route.points[0],
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = route;
      }
    }
    if (bestRoute && bestDistance <= ROUTE_MATCH_TOLERANCE_METERS) {
      routeImageUrl = pickNearestRouteFrameImage(bestRoute.frames, coord);
    }
  }
  const displayImageUrl = liveImageUrl ?? routeImageUrl;
  const isRoutePreview = !liveImageUrl && Boolean(routeImageUrl);

  return (
    <div className="drone-window">
      <header className="drone-window__head">
        <div className="drone-window__title-group">
          <span className="drone-window__title">{drone.name}</span>
          <span className="drone-window__subtitle">
            {liveImageUrl
              ? "드론 탑재 카메라 시점 · 실시간 재생"
              : isRoutePreview
                ? "드론 탑재 카메라 시점 · 정상경로"
                : "드론 탑재 카메라 시점 · 시뮬레이션"}
          </span>
        </div>
        <StatusBadge tone="primary">{view.statusLabel}</StatusBadge>
      </header>

      <div className="drone-window__screen">
        <ImageFallback
          className="drone-window__image"
          src={displayImageUrl ?? drone.cardImageUrl}
          fallbackSrc={DEFAULT_DRONE_CARD_IMAGE_PATH}
          alt={`${drone.name} 드론뷰`}
        />
        <span className="drone-window__live">
          {describeLiveBadge(Boolean(liveImageUrl), liveStatus, isRoutePreview)}
        </span>
      </div>

      <dl className="drone-window__meta">
        <div>
          <dt>항법</dt>
          <dd>{view.navigationStatusLabel}</dd>
        </div>
        <div>
          <dt>배터리</dt>
          <dd>{view.batteryPercent}%</dd>
        </div>
        <div>
          <dt>고도</dt>
          <dd>{Math.round(coord.altitude)}m</dd>
        </div>
        <div>
          <dt>좌표</dt>
          <dd className="drone-window__mono">
            {coord.latitude.toFixed(5)}, {coord.longitude.toFixed(5)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
