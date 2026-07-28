import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AppPanel,
  BrandLogo,
  ConfirmModal,
  CoordinateDisplay,
  EmptyState,
  ErrorState,
  FormModal,
  IconButton,
  ModalShell,
  NumberInput,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextArea,
  TextInput,
  type StatusTone,
} from "../../shared/components";
import { OperationDroneControlPopup } from "./OperationDroneControlPopup";
import {
  OperationEventLogPopup,
  type OperationEventLogEntry,
} from "./OperationEventLogPopup";
import { DroneList } from "../../features/drone/components";
import { TargetInfoPopup } from "../../features/target/components";
import {
  getMapLayerLabel,
  MapPointPickerModal,
  OperationMapPlaceholder,
  OperationMiniMap,
  OperationNaverMap,
  OperationNaverMiniMap,
  type DroneMarkerTone,
  type OperationNaverMapDroneTrack,
  type OperationNaverMapZone,
} from "../../features/operation-map/components";
import {
  DroneDetailPopup,
  type DroneRuntimeMetrics,
} from "../../features/drone/components";
import {
  targetDiscoveryKey,
  useTargetDiscoveryStore,
} from "../../features/target/targetDiscoveryStore";
import { horizontalMetersBetween } from "../../shared/utils/geo";
import { useNaverMapsSdk } from "../../features/operation-map/naver/naverMapsLoader";
import {
  useCreateEnemyAreaMutation,
  useCreateOperationAreaDroneMutation,
  useDroneViewRoutesQuery,
  useOperationAreasQuery,
  useOperationSnapshotQuery,
  useUnassignOperationAreaDroneMutation,
} from "../../features/operation/hooks";
import {
  useCreateSituationReportMutation,
  useInterferenceAutoReport,
} from "../../features/report/hooks";
import {
  pickNearestRouteFrameImage,
  routeFramesToWaypoints,
  uploadDroneImage,
  type DroneViewRoute,
} from "../../api";
import { AreaCreateForm } from "../../features/enemy-area/components";
import {
  useActiveScenarioRunsQuery,
  useCreateScenarioRunMutation,
  useRunnableScenarioTemplatesQuery,
  useStopScenarioRunMutation,
} from "../../features/scenario/hooks";
import {
  safeParseScenarioRunRequest,
} from "../../features/scenario/domain";
import {
  applyRealtimeDroneRuntimeStatusSeed,
  clearRealtimeDroneRunTracks,
  extractRuntimeStatusSeedsFromScenarioRun,
  resolveActiveInterferenceType,
  RealtimeEventMonitor,
  useDroneRuntimeRealtimeSync,
  useDroneViewRealtimeSync,
  useRealtimeConnection,
  useRealtimeDroneKeyframes,
  useRealtimeDroneRuntimeStatuses,
  useRealtimeDroneTracks,
  useRealtimeDroneView,
  useRealtimeEventObserver,
  useScenarioRealtimeSync,
  useScenarioStoppedCleanup,
  seedRealtimeDroneTrack,
  selectRealtimeDroneTrack,
  selectRealtimeDroneView,
  type RealtimeDronePositionLogEntry,
  type RealtimeDroneRuntimeStatus,
  type RealtimeDroneTrack,
} from "../../features/realtime";
import {
  resolveOperationDroneDisplayPosition,
} from "../../features/operation-map/utils/resolveOperationDroneDisplayPosition";
import { useSmoothedDronePositions } from "../../features/operation-map/utils/useSmoothedDronePositions";
import { ApiError } from "../../api/apiClient";
import {
  createClientRequestId,
  getMutationErrorMessage,
} from "./operationRequestHelpers";
import { GPS_ERROR_CAUTION_METERS } from "./operationLogFormat";
import { droneCreateSchema } from "../../features/drone/validation";
import {
  MAX_DRONES_PER_ENEMY_AREA,
} from "../../shared/constants";
import { queryKeys } from "../../shared/constants/queryKeys";
import {
  getReportPosition,
  postEnemyAreaChange,
  subscribeEnemyAreaChange,
} from "../../shared/utils";
import type {
  Coordinate,
  Drone,
  EnemyAreaCreateInput,
  ReportReference,
  ThreeDimensionalCoordinate,
} from "../../shared/types";
import {
  useDroneFlightStore,
  useMapUiStore,
  useOperationUiStore,
} from "../../stores";
import { useKstClock } from "../../shared/hooks";
import "../../shared/styles/layout.css";
import "./operation.css";


// 드론이 이 거리 안으로 표적을 지나가면 "발견" 처리 (프론트 시뮬)
const TARGET_DISCOVERY_RADIUS_METERS = 150;

// 드론 출발 좌표가 이 거리 안이면 그 데이터셋 route를 이 드론의 정상 경로로 본다.
const ROUTE_MATCH_TOLERANCE_METERS = 60;

// 경로 미매칭 드론에 넘길 안정적인 빈 웨이포인트 배열(불필요한 리렌더 방지).
const EMPTY_WAYPOINTS: ThreeDimensionalCoordinate[] = [];

// 항법 상태별 표시용 텔레메트리 (백엔드가 raw 수치를 주기 전까지 status에서 도출)
// 백엔드 요구사항: signalStrength/satelliteCount/gpsUpdateDelay 실측치 전달 시 그대로 대체.
const GNSS_TELEMETRY: Record<
  string,
  { signalPercent: number | null; satellites: number | null }
> = {
  NORMAL: { signalPercent: 92, satellites: 12 },
  VERIFYING: { signalPercent: 58, satellites: 7 },
  ASSISTING: { signalPercent: 41, satellites: 5 },
  DEGRADED: { signalPercent: 14, satellites: 2 },
  UNAVAILABLE: { signalPercent: 0, satellites: 0 },
  IDLE: { signalPercent: null, satellites: null },
};

const INS_DRIFT_METRIC: Record<string, string> = {
  NORMAL: "드리프트 0.2 m/s",
  VERIFYING: "드리프트 0.3 m/s",
  ASSISTING: "주 추정 · 0.4 m/s",
  DEGRADED: "드리프트 1.1 m/s",
  IDLE: "대기",
};

function buildGnssMetric(
  status: string | undefined,
  gpsErrorMeters: number | null,
): string {
  const telemetry = status ? GNSS_TELEMETRY[status] : undefined;
  if (!telemetry || telemetry.signalPercent === null) {
    return "대기";
  }
  const parts = [
    `신호 ${telemetry.signalPercent}%`,
    `위성 ${telemetry.satellites}`,
  ];
  if (gpsErrorMeters !== null && gpsErrorMeters >= 1) {
    parts.push(`오차 ${gpsErrorMeters.toFixed(1)}m`);
  }
  return parts.join(" · ");
}


// 실시간 runtime 항법 상태 → 항법 시스템 스트립 표기
const RUNTIME_NAV_VIEWS: Record<string, { label: string; tone: StatusTone }> = {
  NORMAL: { label: "정상", tone: "success" },
  DEGRADED: { label: "신호 저하", tone: "danger" },
  UNAVAILABLE: { label: "신호 상실", tone: "danger" },
  VERIFYING: { label: "검증 중", tone: "warning" },
  ASSISTING: { label: "보정 중", tone: "ai" },
  IDLE: { label: "대기", tone: "neutral" },
};

const RUNTIME_CROSS_VIEWS: Record<string, { label: string; tone: StatusTone }> = {
  IDLE: { label: "대기", tone: "neutral" },
  PREPARING: { label: "준비 중", tone: "warning" },
  ACTIVE: { label: "작동 중", tone: "ai" },
  CORRECTED: { label: "보정 완료", tone: "success" },
};

// INS는 재밍/스푸핑 중에도 계속 작동하는 것이 핵심 가치라 "보정 중" 같은 세부 단계보다
// 운영 여부(운영 중/미운영)를 그대로 보여주는 편이 더 직관적이다.
// 운영 중이면 GNSS 상태와 무관하게 항상 초록(success)으로 표시한다 — INS는 재밍/스푸핑
// 중에도 스스로 계속 작동하므로, GNSS가 나쁘다고 INS 칩까지 경고색으로 보일 이유가 없다.
const INS_OPERATING_VIEWS: Record<string, { label: string; tone: StatusTone }> = {
  IDLE: { label: "미운영", tone: "neutral" },
  NORMAL: { label: "운영 중", tone: "success" },
  VERIFYING: { label: "운영 중", tone: "success" },
  ASSISTING: { label: "운영 중", tone: "success" },
  DEGRADED: { label: "운영 중", tone: "success" },
};

type NavCardSystem = { name: string; label: string; tone: StatusTone; metric: string };
type NavCard = { key: string; systems: NavCardSystem[] };

// Cross-view는 평소(GPS 정상)에는 꺼져 있다가, GPS가 비정상이고 그로 인한 위치 오차가
// 커졌을 때만 켜진다. 백엔드가 실제 시나리오 런타임에서 이 규칙으로 계산한
// crossViewStatus를 보내주면 그 값을 그대로 신뢰하고(중복 계산 금지), 런타임 정보가
// 없는 평상시에는 동일한 규칙을 프론트에서 계산해 "평소엔 꺼짐"이 실제로 보이게 한다.
function computeFallbackCrossViewStatus(
  gnssStatus: string,
  gpsErrorMeters: number | null,
): "IDLE" | "PREPARING" | "ACTIVE" {
  const isGnssAbnormal = gnssStatus !== "NORMAL" && gnssStatus !== "IDLE";
  if (!isGnssAbnormal) {
    return "IDLE";
  }
  const isErrorLarge =
    gpsErrorMeters !== null && gpsErrorMeters > GPS_ERROR_CAUTION_METERS;
  return isErrorLarge ? "ACTIVE" : "PREPARING";
}

// 드론 하나의 좌표 비교·AI 추정 지표를 3경로 궤적에서 도출한다 (없으면 null).
// 상세 팝업이 드론마다 독립적으로 뜰 수 있어, 선택 드론에 묶이지 않도록 순수 함수로 둔다.
function buildDroneRuntimeMetrics(
  track: RealtimeDroneTrack | undefined,
  displayPosition: { latitude: number; longitude: number },
): DroneRuntimeMetrics | null {
  if (!track) {
    return null;
  }
  const truePosition =
    track.truePath.length > 0
      ? track.truePath[track.truePath.length - 1].position
      : displayPosition;
  const gpsPosition = track.gpsCurrent ?? truePosition;
  const correctedPosition = track.correctedCurrent ?? null;
  return {
    gpsPosition,
    trustedPosition: truePosition,
    correctedPosition,
    gpsErrorMeters: horizontalMetersBetween(gpsPosition, truePosition),
    correctionMeters: correctedPosition
      ? horizontalMetersBetween(gpsPosition, correctedPosition)
      : null,
    confidence: track.crossViewConfidence,
    matchScore: track.crossViewMatchScore,
  };
}

// 드론 하나의 항법 시스템 상태 카드(GPS/Galileo·INS·AI Cross-view·GNSS/RTK)를 만든다.
// 실시간 runtime 상태가 있으면 그 값을, 없으면 드론 snapshot의 항법 상태를 기준으로 한다.
function buildDroneNavCards(
  drone: Drone,
  runtimeStatus: RealtimeDroneRuntimeStatus | null,
  metrics: DroneRuntimeMetrics | null,
): NavCard[] {
  const fallbackNavView: { label: string; tone: StatusTone } =
    drone.navigationStatus === "normal"
      ? { label: "정상", tone: "success" }
      : { label: "주의", tone: "warning" };
  const navigation = runtimeStatus?.navigation ?? null;
  const gpsErrorForNav = metrics?.gpsErrorMeters ?? null;
  const crossViewStatus =
    runtimeStatus?.crossViewStatus ??
    navigation?.crossView ??
    (navigation
      ? computeFallbackCrossViewStatus(navigation.gnss, gpsErrorForNav)
      : "IDLE");
  const gnssView = navigation
    ? (RUNTIME_NAV_VIEWS[navigation.gnss] ?? fallbackNavView)
    : fallbackNavView;
  const insView = navigation
    ? (INS_OPERATING_VIEWS[navigation.ins] ?? fallbackNavView)
    : fallbackNavView;
  const crossViewView = RUNTIME_CROSS_VIEWS[crossViewStatus] ?? fallbackNavView;
  const gnssMetric = buildGnssMetric(navigation?.gnss, gpsErrorForNav);
  const insMetric = navigation ? INS_DRIFT_METRIC[navigation.ins] ?? "대기" : "대기";
  const crossViewMetric = (() => {
    const confidence = metrics?.confidence ?? null;
    const matchScore = metrics?.matchScore ?? null;
    const parts = [
      confidence !== null ? `신뢰도 ${Math.round(confidence)}%` : null,
      matchScore !== null ? `매칭 ${Math.round(matchScore)}%` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : crossViewView.label;
  })();
  return [
    {
      key: "gnss-constellations",
      systems: [
        { name: "GPS", label: gnssView.label, tone: gnssView.tone, metric: gnssMetric },
        { name: "Galileo", label: gnssView.label, tone: gnssView.tone, metric: gnssMetric },
      ],
    },
    {
      key: "INS",
      systems: [
        { name: "INS", label: insView.label, tone: insView.tone, metric: insMetric },
      ],
    },
    {
      key: "AI Cross-view",
      systems: [
        {
          name: "AI Cross-view",
          label: crossViewView.label,
          tone: crossViewView.tone,
          metric: crossViewMetric,
        },
      ],
    },
    {
      key: "GNSS/RTK",
      systems: [
        { name: "GNSS/RTK", label: gnssView.label, tone: gnssView.tone, metric: gnssMetric },
      ],
    },
  ];
}

type DroneFormState = {
  name: string;
  model: string;
  missionType: string;
  departureLatitude: string;
  departureLongitude: string;
  departureAltitude: string;
  iconImageFile: File | null;
  cardImageFile: File | null;
};

const emptyDroneForm: DroneFormState = {
  name: "",
  model: "",
  missionType: "",
  departureLatitude: "",
  departureLongitude: "",
  departureAltitude: "",
  iconImageFile: null,
  cardImageFile: null,
};

type ReportFormState = {
  title: string;
  content: string;
  important: boolean;
  linkedDroneId: string;
};

const emptyReportForm: ReportFormState = {
  title: "",
  content: "",
  important: false,
  linkedDroneId: "",
};

type DroneFormErrors = Partial<Record<keyof DroneFormState, string>>;

function getFirstFieldError(errors: string[] | undefined) {
  return errors?.[0];
}

function toOptionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function getOperationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "작전지 데이터를 불러오지 못했습니다.";
}


/** 드론 등록 후 이미지 업로드. 실패한 항목의 라벨 목록을 돌려준다. */
async function uploadDroneImagesBestEffort(
  droneId: string,
  iconFile: File | null,
  cardFile: File | null,
): Promise<string[]> {
  const failedLabels: string[] = [];
  if (iconFile) {
    try {
      await uploadDroneImage(droneId, "icon", iconFile);
    } catch {
      failedLabels.push("지도 이미지");
    }
  }
  if (cardFile) {
    try {
      await uploadDroneImage(droneId, "card", cardFile);
    } catch {
      failedLabels.push("카드 이미지");
    }
  }
  return failedLabels;
}

export function OperationPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAreaId = searchParams.get("areaId");

  const currentAreaId = useOperationUiStore((state) => state.currentAreaId);
  const selectedDroneId = useOperationUiStore((state) => state.selectedDroneId);
  const selectedTargetId = useOperationUiStore((state) => state.selectedTargetId);
  const isDroneAddModalOpen = useOperationUiStore(
    (state) => state.isDroneAddModalOpen,
  );
  const isReportModalOpen = useOperationUiStore(
    (state) => state.isReportModalOpen,
  );
  const setCurrentAreaId = useOperationUiStore(
    (state) => state.setCurrentAreaId,
  );
  const selectDrone = useOperationUiStore((state) => state.selectDrone);
  const selectTarget = useOperationUiStore((state) => state.selectTarget);
  const openDroneAddModal = useOperationUiStore(
    (state) => state.openDroneAddModal,
  );
  const closeDroneAddModal = useOperationUiStore(
    (state) => state.closeDroneAddModal,
  );
  const openReportModal = useOperationUiStore((state) => state.openReportModal);
  const closeReportModal = useOperationUiStore(
    (state) => state.closeReportModal,
  );

  const mapMode = useMapUiStore((state) => state.mapMode);
  const layers = useMapUiStore((state) => state.layers);
  const activePopupId = useMapUiStore((state) => state.activePopupId);
  const setMapMode = useMapUiStore((state) => state.setMapMode);
  const toggleLayer = useMapUiStore((state) => state.toggleLayer);
  const setLayer = useMapUiStore((state) => state.setLayer);
  const setActivePopupId = useMapUiStore((state) => state.setActivePopupId);
  const closePopup = useMapUiStore((state) => state.closePopup);
  const resetMapUi = useMapUiStore((state) => state.resetMapUi);

  // 평상시 드론 이동 런타임 (flight 전용 store) — Snapshot 원본은 불변으로 둔다.
  const flightRuntimes = useDroneFlightStore((state) => state.runtimes);
  const flightEvents = useDroneFlightStore((state) => state.events);
  const resetFlightArea = useDroneFlightStore((state) => state.resetArea);
  const syncFlightDrones = useDroneFlightStore((state) => state.syncDrones);
  const removeFlightDrone = useDroneFlightStore((state) => state.removeDrone);
  const applyMove = useDroneFlightStore((state) => state.applyMove);
  const followRoute = useDroneFlightStore((state) => state.followRoute);
  const pauseFlight = useDroneFlightStore((state) => state.pause);
  const resumeFlight = useDroneFlightStore((state) => state.resume);
  const hoverFlight = useDroneFlightStore((state) => state.hover);
  const returnFlight = useDroneFlightStore((state) => state.returnToBase);
  const logFlightEvent = useDroneFlightStore((state) => state.logEvent);
  const alignFlightPositions = useDroneFlightStore(
    (state) => state.alignPositions,
  );
  const disposeFlight = useDroneFlightStore((state) => state.dispose);

  const operationAreasQuery = useOperationAreasQuery();
  const operationAreas = useMemo(
    () => operationAreasQuery.data ?? [],
    [operationAreasQuery.data],
  );
  const isOperationAreasLoaded = operationAreasQuery.data !== undefined;
  const hasOperationAreas = operationAreas.length > 0;
  const explicitAreaId = requestedAreaId ?? currentAreaId;
  const hadExplicitAreaRequest = explicitAreaId !== null;
  const isExplicitAreaIdValid =
    explicitAreaId !== null &&
    operationAreas.some((area) => area.id === explicitAreaId);
  // 로그인 직후 기본 화면은 "아무 작전지역도 선택되지 않은" 상태여야 한다 — 예전엔
  // 목록의 첫 작전지역을 자동으로 골랐지만, 이제는 명시적으로 요청(URL/이전 선택)된
  // 경우에만 areaId를 채우고, 그 외엔 헤더에서 사용자가 직접 고르게 한다.
  const areaId = isExplicitAreaIdValid ? explicitAreaId : null;
  const snapshotQuery = useOperationSnapshotQuery(areaId);
  const operationAreaOptions = useMemo(
    () =>
      operationAreas.map((area) => ({
        value: area.id,
        label: area.name,
      })),
    [operationAreas],
  );
  const fallbackArea = useMemo(
    () =>
      operationAreas.find((area) => area.id === areaId) ??
      operationAreas[0] ?? {
        id: areaId ?? "",
        name: "작전지 로딩 중",
        latitude: 0,
        longitude: 0,
        radiusMeters: 1,
        createdAt: "",
        updatedAt: "",
      },
    [areaId, operationAreas],
  );
  const fallbackSnapshot = useMemo(
    () => ({
      enemyArea: fallbackArea,
      drones: [],
      targets: [],
      activeScenarios: [],
    }),
    [fallbackArea],
  );
  const snapshot = snapshotQuery.data ?? fallbackSnapshot;
  const { enemyArea, drones, targets, activeScenarios } = snapshot;
  const activeScenarioRunsQuery = useActiveScenarioRunsQuery(areaId);
  const activeScenarioRun =
    activeScenarioRunsQuery.data?.find((run) => run.areaId === areaId) ?? null;
  const activeScenarioRunId = activeScenarioRun?.id ?? null;
  const realtimeDroneKeyframes = useRealtimeDroneKeyframes();
  // 백엔드가 시나리오 재생 시 보내는 드론뷰 프레임(좌표+이미지) 스토어 — 마커를 route
  // 위로 움직이는 데 쓰므로 rawDisplayDrones보다 먼저 선언한다.
  const droneViewSnapshot = useRealtimeDroneView();
  const realtimeDroneRuntimeStatuses = useRealtimeDroneRuntimeStatuses();
  const realtimeObserver = useRealtimeEventObserver(areaId);
  const scenarioRealtimeSync = useScenarioRealtimeSync({
    currentAreaId: areaId,
    onMalformedNotification: realtimeObserver.recordDiagnostic,
  });
  const scenarioStoppedCleanup = useScenarioStoppedCleanup({
    currentAreaId: areaId,
  });
  const droneRuntimeRealtimeSync = useDroneRuntimeRealtimeSync({
    currentAreaId: areaId,
    onMalformedEvent: realtimeObserver.recordDiagnostic,
  });
  const droneViewRealtimeSync = useDroneViewRealtimeSync({
    currentAreaId: areaId,
    onMalformedEvent: realtimeObserver.recordDiagnostic,
  });
  const realtimeConnectionState = useRealtimeConnection(areaId, {
    onDiagnostic: realtimeObserver.recordDiagnostic,
    onEvent: (event) => {
      try {
        realtimeObserver.recordEvent(event);
      } catch {
        // Realtime consumers must not block each other.
      }
      try {
        scenarioRealtimeSync(event);
      } catch {
        // REST refetch notifications must not break observer logging.
      }
      try {
        scenarioStoppedCleanup(event);
      } catch {
        // Scenario completion cleanup must not block drone runtime stores.
      }
      try {
        droneRuntimeRealtimeSync(event);
      } catch {
        // Drone runtime keyframes and statuses must not block other realtime consumers.
      }
      try {
        droneViewRealtimeSync(event);
      } catch {
        // Drone view playback frames must not block other realtime consumers.
      }
    },
    onReconnect: realtimeObserver.recordReconnect,
  });

  // 표시용 드론 위치 우선순위: 위치보정이 적용된 프레임은 보정 좌표를 사용하고,
  // 그 외에는 드론뷰 프레임 좌표를 사용한다. 프레임이 없으면 기존 순서
  // (서버 keyframe → flight → snapshot)를 그대로 따른다.
  const rawDisplayDrones = useMemo(
    () =>
      drones.map((drone) => {
        const frame = areaId
          ? selectRealtimeDroneView(droneViewSnapshot, areaId, drone.id)
          : undefined;
        const preferredFramePosition =
          frame?.correctionApplied && frame.correctedPosition
            ? frame.correctedPosition
            : frame?.position;
        const framePosition =
          preferredFramePosition &&
          Number.isFinite(preferredFramePosition.latitude) &&
          Number.isFinite(preferredFramePosition.longitude)
            ? preferredFramePosition
            : null;
        const position =
          framePosition ??
          resolveOperationDroneDisplayPosition({
            areaId,
            activeRunId: activeScenarioRunId,
            droneId: drone.id,
            keyframeSnapshot: realtimeDroneKeyframes,
            localFlightRuntime: flightRuntimes[drone.id],
            snapshotPosition: drone.currentPosition,
          }).position;
        return position
          ? {
              ...drone,
              currentPosition: {
                latitude: position.latitude,
                longitude: position.longitude,
                altitude: Math.round(position.altitude ?? drone.currentPosition.altitude),
              },
            }
          : drone;
      }),
    [
      activeScenarioRunId,
      areaId,
      drones,
      flightRuntimes,
      realtimeDroneKeyframes,
      droneViewSnapshot,
    ],
  );

  // 시나리오가 실시간 위치(keyframe 또는 드론뷰 프레임)로 구동 중인 드론
  // (수동 제어 잠금 + 마커 보간 대상 — 프레임 사이를 부드럽게 이어 이동시킨다)
  const scenarioDrivenIds = useMemo(() => {
    const ids = new Set<string>();
    if (!areaId || !activeScenarioRunId) {
      return ids;
    }
    for (const keyframe of Object.values(realtimeDroneKeyframes.keyframes)) {
      if (
        keyframe.areaId === areaId &&
        keyframe.runId === activeScenarioRunId
      ) {
        ids.add(keyframe.droneId);
      }
    }
    for (const view of Object.values(droneViewSnapshot.views)) {
      if (view.areaId === areaId && view.position) {
        ids.add(view.droneId);
      }
    }
    return ids;
  }, [areaId, activeScenarioRunId, realtimeDroneKeyframes, droneViewSnapshot]);

  // keyframe은 약 1초 간격이라 그대로 표시하면 마커가 순간이동한다 → 짧게 보간
  // (최종 displayDrones는 droneTones 계산 후 항법 상태를 실시간 값으로 덮어써 만든다)
  const smoothedDisplayDrones = useSmoothedDronePositions(
    rawDisplayDrones,
    scenarioDrivenIds,
  );

  // 시나리오 궤적/좌표 비교 스토어 (3경로 폴리라인·위치 로그·AI 지표)
  const droneTrackSnapshot = useRealtimeDroneTracks();

  // "지도에 표시할 run"은 활성 run이 없어져도(자동 완료·수동 중지) 같은 작전지역에서 마지막으로
  // 확인된 run을 계속 가리킨다 — 그려진 경로가 시나리오 종료와 동시에 사라지지 않게 하기 위함.
  // 작전지역을 바꾸면 그 지역의 활성 run으로 즉시 갱신한다. (렌더 중 상태 조정 — React가
  // prop 변화에 맞춰 state를 즉시 정렬하도록 공식적으로 권장하는 패턴이라 effect를 쓰지 않는다.)
  const [prevAreaIdForRun, setPrevAreaIdForRun] = useState(areaId);
  const [lastKnownRunId, setLastKnownRunId] = useState<string | null>(
    activeScenarioRunId,
  );
  if (areaId !== prevAreaIdForRun) {
    setPrevAreaIdForRun(areaId);
    setLastKnownRunId(activeScenarioRunId);
  } else if (activeScenarioRunId && activeScenarioRunId !== lastKnownRunId) {
    setLastKnownRunId(activeScenarioRunId);
  }
  const trackDisplayRunId = activeScenarioRunId ?? lastKnownRunId;

  // 같은 작전지역에서 새 run이 시작되면(runId가 달라지면) 이전 run의 지도 표시용 궤적만
  // 정리한다(위치/상태 로그는 기록성 유지). 상태 조정과 분리된 순수 부수효과라 effect로 둔다.
  const previousTrackRunKeyRef = useRef<{ areaId: string; runId: string } | null>(
    null,
  );
  useEffect(() => {
    const current =
      areaId && lastKnownRunId ? { areaId, runId: lastKnownRunId } : null;
    const previous = previousTrackRunKeyRef.current;
    if (
      previous &&
      current &&
      (previous.areaId !== current.areaId || previous.runId !== current.runId)
    ) {
      clearRealtimeDroneRunTracks(previous.areaId, previous.runId);
    }
    previousTrackRunKeyRef.current = current;
  }, [areaId, lastKnownRunId]);

  const droneTracks = useMemo(() => {
    if (!areaId || !trackDisplayRunId) {
      return {};
    }
    const toCoords = (points: readonly { position: Coordinate }[]) =>
      points.map((point) => ({
        latitude: point.position.latitude,
        longitude: point.position.longitude,
      }));
    const result: Record<string, OperationNaverMapDroneTrack> = {};
    for (const track of Object.values(droneTrackSnapshot.tracks)) {
      if (track.areaId !== areaId || track.runId !== trackDisplayRunId) {
        continue;
      }
      // 교란이 한 번이라도 발생한 뒤에는 GNSS·보정 경로를 계속 표시한다(hadInterference sticky).
      // 정상 비행만 하는 구간은 초록 정상 경로 하나로 충분해 중복을 피하고, 교란이 시작되면
      // 그때부터 두 경로가 나타나 이후로 사라지지 않는다(재밍은 GNSS 경로가 freeze되어 보인다).
      const show = track.hadInterference;
      result[track.droneId] = {
        gpsPath: show ? toCoords(track.gpsPath) : [],
        correctedPath: show ? toCoords(track.correctedPath) : [],
        gpsCurrent: track.gpsCurrent,
        correctedCurrent: track.correctedCurrent,
        interferenceType: track.interferenceType,
      };
    }
    return result;
  }, [areaId, trackDisplayRunId, droneTrackSnapshot]);

  // 정상(계획) 경로 — 백엔드 데이터셋 route(출발→도착 전체 좌표)를 드론의 출발 좌표로
  // 매칭한다. 이 매칭 결과 하나로 (1) 지도 초록 라인, (2) 드론 위치에 맞는 드론뷰 이미지,
  // (3) "경로 따라 이동" 웨이포인트를 모두 파생시킨다. 데이터셋은 정적이라 한 번만 받아 캐시한다.
  const droneViewRoutesQuery = useDroneViewRoutesQuery();
  const droneMatchedRoutes = useMemo(() => {
    const routes = droneViewRoutesQuery.data ?? [];
    const result: Record<string, DroneViewRoute> = {};
    if (routes.length === 0) {
      return result;
    }
    for (const drone of drones) {
      const departure = drone.departurePosition;
      if (!departure) {
        continue;
      }
      // 출발 좌표가 route 시작점과 가장 가깝고 임계 이내인 route를 그 드론의 정상 경로로 본다.
      let bestRoute: DroneViewRoute | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const route of routes) {
        const distance = horizontalMetersBetween(departure, route.points[0]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRoute = route;
        }
      }
      if (bestRoute && bestDistance <= ROUTE_MATCH_TOLERANCE_METERS) {
        result[drone.id] = bestRoute;
      }
    }
    return result;
  }, [droneViewRoutesQuery.data, drones]);

  // 지도 폴리라인용 정상 경로 좌표(시나리오 실행과 무관하게 항상 초록 라인으로 그린다).
  const droneRoutes = useMemo(() => {
    const result: Record<string, Coordinate[]> = {};
    for (const [droneId, route] of Object.entries(droneMatchedRoutes)) {
      result[droneId] = route.points;
    }
    return result;
  }, [droneMatchedRoutes]);

  // "경로 따라 이동"용 3D 웨이포인트(고도 포함). 드론 제어 팝업에 넘긴다.
  const droneRouteWaypoints = useMemo(() => {
    const result: Record<string, ThreeDimensionalCoordinate[]> = {};
    for (const [droneId, route] of Object.entries(droneMatchedRoutes)) {
      result[droneId] = routeFramesToWaypoints(route.frames);
    }
    return result;
  }, [droneMatchedRoutes]);

  const activeRuntimeStatuses = useMemo(() => {
    if (!areaId || !activeScenarioRunId) {
      return [];
    }
    return Object.values(realtimeDroneRuntimeStatuses.statuses)
      .filter(
        (status) =>
          status.areaId === areaId && status.runId === activeScenarioRunId,
      )
      .sort((a, b) => a.droneId.localeCompare(b.droneId));
  }, [
    activeScenarioRunId,
    areaId,
    realtimeDroneRuntimeStatuses,
  ]);

  // 시나리오 실행 중 새로고침 등으로 진입 시, 서버 runtime 복구 응답으로
  // 항법/교란 상태(runtime status)와 3경로 좌표 비교(track)를 즉시 복원한다.
  useEffect(() => {
    const seeds = extractRuntimeStatusSeedsFromScenarioRun(activeScenarioRun);
    for (const seed of seeds) {
      applyRealtimeDroneRuntimeStatusSeed(seed);
    }
    if (!activeScenarioRun) {
      return;
    }
    for (const runtime of activeScenarioRun.droneRuntimes) {
      const updatedAtMs = Date.parse(runtime.updatedAt);
      if (!Number.isFinite(updatedAtMs)) {
        continue;
      }
      const interference = runtime.interference;
      // 정적 config 유형이 아니라 실제 교란 활성 여부로 판정한다 — 정상 비행 구간(status=IDLE,
      // 구역 밖)에서 GPS freeze/보정 경로가 잘못 그려지던 문제를 막는다.
      const interferenceType = resolveActiveInterferenceType(runtime);
      seedRealtimeDroneTrack({
        areaId: activeScenarioRun.areaId,
        runId: runtime.runId || activeScenarioRun.id,
        droneId: runtime.droneId,
        position: runtime.position,
        updatedAtMs,
        interferenceType,
        reportedPosition:
          interferenceType === "SPOOFING" && interference?.type === "SPOOFING"
            ? interference.reportedPosition ?? null
            : null,
        trustedPosition:
          interferenceType === "SPOOFING" && interference?.type === "SPOOFING"
            ? interference.trustedPosition ?? null
            : null,
      });
    }
  }, [activeScenarioRun]);

  // 실지도 marker 색/항법 스트립에 쓰는 드론별 교란 tone
  const droneTones = useMemo(() => {
    const tones: Record<string, DroneMarkerTone> = {};
    for (const status of activeRuntimeStatuses) {
      tones[status.droneId] =
        status.crossViewStatus === "CORRECTED"
          ? "corrected"
          : status.interferenceType === "SPOOFING"
            ? "spoofing"
            : status.interferenceType === "JAMMING"
              ? "jamming"
              : status.crossViewStatus === "ACTIVE" ||
                  status.crossViewStatus === "PREPARING"
                ? "crossview"
                : "normal";
    }
    return tones;
  }, [activeRuntimeStatuses]);

  // 표시용 드론의 항법 상태를 실시간 값으로 덮어쓴다 — REST 스냅샷의 navigationStatus는
  // 갱신 주기가 느려 카드/팝업 표기가 굼떠 보인다. 교란·보정 중에는 프레임 텔레메트리로
  // 판정한 tone이 훨씬 빠르므로 그 값을 우선한다(정상 복귀 시에도 즉시 되돌아온다).
  const displayDrones = useMemo(
    () =>
      smoothedDisplayDrones.map((drone) => {
        const tone = droneTones[drone.id];
        const override =
          tone === "jamming" || tone === "spoofing"
            ? ("gnss_unstable" as const)
            : tone === "crossview" || tone === "corrected"
              ? ("cross_view_tracking" as const)
              : tone === "normal"
                ? ("normal" as const)
                : null;
        return override && drone.navigationStatus !== override
          ? { ...drone, navigationStatus: override }
          : drone;
      }),
    [smoothedDisplayDrones, droneTones],
  );

  // 어느 드론이든 실제로 교란(재밍/스푸핑) 중이면 지도 전체를 "교란 상황 모드"로 전환한다:
  // 드론 아이콘 외 나머지 아이콘의 텍스트 라벨을 지우고, 드론 아이콘 라벨은 키운다.
  const hasActiveInterference = useMemo(
    () =>
      Object.values(droneTones).some(
        (tone) => tone === "jamming" || tone === "spoofing",
      ),
    [droneTones],
  );

  // active scenario 교란 구역 → 실지도 원 표시
  const interferenceZone = useMemo<OperationNaverMapZone | null>(() => {
    if (!activeScenarioRun) {
      return null;
    }
    return {
      center: activeScenarioRun.interferenceZone.center,
      radiusMeters: activeScenarioRun.interferenceZone.radiusMeters,
      tone: activeScenarioRun.scenarioType === "JAMMING" ? "jamming" : "spoofing",
    };
  }, [activeScenarioRun]);

  // 표적 발견 시뮬: 배치된 표적은 숨겨져 있다가 드론이 근접 통과하면 나타난다
  const discoveredTargets = useTargetDiscoveryStore((state) => state.discovered);
  const markTargetDiscovered = useTargetDiscoveryStore(
    (state) => state.markDiscovered,
  );
  const visibleTargets = useMemo(
    () =>
      areaId
        ? targets.filter(
            (target) => discoveredTargets[targetDiscoveryKey(areaId, target.id)],
          )
        : [],
    [areaId, targets, discoveredTargets],
  );

  useEffect(() => {
    if (!areaId) {
      return;
    }
    for (const target of targets) {
      if (discoveredTargets[targetDiscoveryKey(areaId, target.id)]) {
        continue;
      }
      const finder = displayDrones.find(
        (drone) =>
          horizontalMetersBetween(drone.currentPosition, target.position) <=
          TARGET_DISCOVERY_RADIUS_METERS,
      );
      if (finder) {
        markTargetDiscovered(areaId, target.id);
        logFlightEvent(
          finder.name,
          `표적 '${target.name}' 발견 (${target.position.latitude.toFixed(5)}, ${target.position.longitude.toFixed(5)})`,
        );
      }
    }
  }, [
    areaId,
    targets,
    displayDrones,
    discoveredTargets,
    markTargetDiscovered,
    logFlightEvent,
  ]);

  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = useState(true);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [mapZoom, setMapZoom] = useState(100);
  const [isDeparturePickerOpen, setIsDeparturePickerOpen] = useState(false);
  // 상세·제어·중요상황기록 팝업은 모두 드론마다 하나씩 독립적으로 띄울 수 있다 —
  // 열려 있는 드론 id 목록으로 관리하고, 실지도 위에 목록 개수만큼 팝업을 렌더링한다
  // (각 팝업은 자기 드래그 위치·입력값·표시 데이터를 스스로 가진다).
  const [openDetailDroneIds, setOpenDetailDroneIds] = useState<string[]>([]);
  const [openControlDroneIds, setOpenControlDroneIds] = useState<string[]>([]);
  const [openEventLogDroneIds, setOpenEventLogDroneIds] = useState<string[]>([]);
  const [mapFocusRequest, setMapFocusRequest] = useState<{
    coordinate: Coordinate;
    token: number;
  } | null>(null);
  const [mapViewportBounds, setMapViewportBounds] = useState<{
    sw: Coordinate;
    ne: Coordinate;
  } | null>(null);

  const zoomIn = () => setMapZoom((zoom) => Math.min(160, zoom + 10));
  const zoomOut = () => setMapZoom((zoom) => Math.max(70, zoom - 10));
  const zoomReset = () => setMapZoom(100);
  const [droneForm, setDroneForm] = useState<DroneFormState>(emptyDroneForm);
  const [droneFormErrors, setDroneFormErrors] = useState<DroneFormErrors>({});
  const [droneFormMessage, setDroneFormMessage] = useState<string | null>(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);
  const [cardPreviewUrl, setCardPreviewUrl] = useState<string | null>(null);
  const [pendingUnassignDroneId, setPendingUnassignDroneId] = useState<
    string | null
  >(null);
  const [droneActionMessage, setDroneActionMessage] = useState<string | null>(
    null,
  );

  const createDroneMutation = useCreateOperationAreaDroneMutation();
  const unassignDroneMutation = useUnassignOperationAreaDroneMutation();
  const createReportMutation = useCreateSituationReportMutation();
  const [reportForm, setReportForm] = useState<ReportFormState>(emptyReportForm);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  // 헤더의 "+ 작전지역 생성" 팝업
  const createAreaMutation = useCreateEnemyAreaMutation();
  const [isAreaCreateModalOpen, setIsAreaCreateModalOpen] = useState(false);
  const [areaCreateMessage, setAreaCreateMessage] = useState<string | null>(null);

  // 헤더의 "시나리오 템플릿 적용"/중지 — ScenarioPage에서 백엔드에 저장해 둔 템플릿
  // (scenario-templates API)을 그대로 실행 요청으로 변환한다.
  const createScenarioRunMutation = useCreateScenarioRunMutation();
  const stopScenarioRunMutation = useStopScenarioRunMutation();
  const [scenarioActionMessage, setScenarioActionMessage] = useState<
    string | null
  >(null);
  const scenarioActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 헤더 버튼의 title 툴팁만으로는 결과가 눈에 안 띈다 — 배너로도 잠깐 보여주고
  // 자동으로 사라지게 한다(교란 경고 배너와 같은 패턴).
  const showScenarioActionMessage = useCallback((text: string) => {
    setScenarioActionMessage(text);
    if (scenarioActionTimerRef.current) {
      clearTimeout(scenarioActionTimerRef.current);
    }
    scenarioActionTimerRef.current = setTimeout(() => {
      setScenarioActionMessage(null);
      scenarioActionTimerRef.current = null;
    }, 6000);
  }, []);
  useEffect(() => {
    return () => {
      if (scenarioActionTimerRef.current) {
        clearTimeout(scenarioActionTimerRef.current);
      }
    };
  }, []);
  const scenarioTemplatesQuery = useRunnableScenarioTemplatesQuery();
  // 헤더 시나리오 실행은 백엔드가 시드한 데이터셋 데모 템플릿(STP-DATASET-DEMO 등, createdBy=system)만
  // 노출한다 — 사용자가 만든 임시 템플릿은 시나리오 작성 화면에서 관리/실행한다. 시드 템플릿이
  // 하나도 없는 환경에선 실행 자체가 막히지 않도록 실행 가능한 전체 목록으로 폴백한다.
  const scenarioTemplates = useMemo(() => {
    const all = scenarioTemplatesQuery.data ?? [];
    const datasetDemos = all.filter((template) => template.createdBy === "system");
    return datasetDemos.length > 0 ? datasetDemos : all;
  }, [scenarioTemplatesQuery.data]);
  // 선택 id가 아직 없거나(최초 로딩) 더 이상 목록에 없으면(삭제 등) 첫 템플릿으로
  // 자동 대체한다 — effect 없이 렌더 중 파생시켜 불필요한 재렌더 연쇄를 피한다.
  const [selectedScenarioTemplateId, setSelectedScenarioTemplateId] = useState("");
  const selectedScenarioTemplate =
    scenarioTemplates.find((template) => template.id === selectedScenarioTemplateId) ??
    scenarioTemplates[0] ??
    null;
  const canApplyScenarioTemplate =
    areaId !== null &&
    selectedScenarioTemplate !== null &&
    drones.length > 0 &&
    !createScenarioRunMutation.isPending;

  const selectedDrone =
    displayDrones.find((drone) => drone.id === selectedDroneId) ?? null;
  const pendingUnassignDrone =
    displayDrones.find((drone) => drone.id === pendingUnassignDroneId) ?? null;
  const selectedTarget =
    visibleTargets.find((target) => target.id === selectedTargetId) ?? null;
  const isDroneLimitReached = drones.length >= MAX_DRONES_PER_ENEMY_AREA;

  // 하단 로그: 로컬 운용 이벤트 + 실시간 상태 로그 병합 (최신순)
  const droneNameById = useMemo(() => {
    const names: Record<string, string> = {};
    for (const drone of drones) {
      names[drone.id] = drone.name;
    }
    return names;
  }, [drones]);
  // 교란 자동 보고에서 "진행 시간 동안의 이미지"로 수집할 현재 드론뷰 프레임 URL.
  const droneFrameUrlById = useMemo(() => {
    const frames: Record<string, string | undefined> = {};
    if (!areaId) {
      return frames;
    }
    for (const view of Object.values(droneViewSnapshot.views)) {
      if (view.areaId === areaId && view.viewImageUrl) {
        frames[view.droneId] = view.viewImageUrl;
      }
    }
    return frames;
  }, [areaId, droneViewSnapshot]);
  // 중요상황기록 팝업은 드론마다 하나씩 뜨므로, 위치 기록/운용 이벤트를 드론 id별로
  // 미리 분류해 둔다(각 팝업은 자기 드론 몫만 표시한다).
  const positionLogByDrone = useMemo(() => {
    const grouped: Record<string, RealtimeDronePositionLogEntry[]> = {};
    for (const entry of droneTrackSnapshot.positionLog) {
      if (entry.areaId !== areaId) {
        continue;
      }
      const list = grouped[entry.droneId] ?? [];
      // 위치 기록은 팝업에서 스크롤로 계속 훑어보므로 넉넉히 쌓는다(스토어 상한까지).
      list.push(entry); // 스토어가 최신순이라 앞에서부터 최신순으로 담긴다
      grouped[entry.droneId] = list;
    }
    return grouped;
  }, [areaId, droneTrackSnapshot]);
  const eventLogByDrone = useMemo(() => {
    const grouped: Record<string, OperationEventLogEntry[]> = {};
    const push = (droneId: string, entry: OperationEventLogEntry) => {
      const list = grouped[droneId] ?? [];
      list.push(entry);
      grouped[droneId] = list;
    };
    for (const entry of droneTrackSnapshot.statusLog) {
      if (entry.areaId !== areaId) {
        continue;
      }
      push(entry.droneId, {
        id: entry.id,
        droneName: droneNameById[entry.droneId] ?? entry.droneId,
        message: `${entry.label} — ${entry.detail}`,
        at: entry.atMs,
      });
    }
    // FlightEvent는 droneId가 없어 이름으로 매칭한다 (작전지역 내 이름은 고유).
    const idByName: Record<string, string> = {};
    for (const drone of drones) {
      idByName[drone.name] = drone.id;
    }
    for (const event of flightEvents) {
      const droneId = idByName[event.droneName];
      if (!droneId) {
        continue;
      }
      push(droneId, event);
    }
    for (const droneId of Object.keys(grouped)) {
      grouped[droneId] = grouped[droneId]
        .sort((a, b) => b.at - a.at)
        .slice(0, 100);
    }
    return grouped;
  }, [areaId, droneNameById, droneTrackSnapshot, flightEvents, drones]);
  // 드론뷰 크게 보기 → 고정 모달이 아니라 독립 브라우저 창으로 연다.
  const openDroneViewWindow = (droneId: string) => {
    if (!areaId) {
      return;
    }
    const params = new URLSearchParams({ areaId, droneId });
    window.open(
      `/drone-view?${params.toString()}`,
      `drone-view-${droneId}`,
      "width=920,height=760,noopener,noreferrer",
    );
  };

  // 목록에서 특정 드론 id를 넣고 빼는 작은 토글 헬퍼 (상세/제어/기록 팝업 공용).
  const removeFromList = (droneId: string) => (ids: string[]) =>
    ids.filter((id) => id !== droneId);
  const addToList = (droneId: string) => (ids: string[]) =>
    ids.includes(droneId) ? ids : [...ids, droneId];

  // 드론 상세 팝업 열기/닫기 — 드론마다 하나씩 독립적으로 뜬다(중복 열기 방지).
  // 상세 팝업을 닫으면 그 드론의 제어·기록 팝업도 함께 닫는다.
  const openDroneDetail = (droneId: string) => {
    setOpenDetailDroneIds(addToList(droneId));
    selectDrone(droneId);
    // placeholder(실지도 미연결) 경로는 자체 팝업 시스템(activePopupId)을 쓴다.
    setActivePopupId(`drone:${droneId}`);
  };
  const closeDroneDetail = (droneId: string) => {
    setOpenDetailDroneIds(removeFromList(droneId));
    setOpenControlDroneIds(removeFromList(droneId));
    setOpenEventLogDroneIds(removeFromList(droneId));
    setActivePopupId(null);
  };

  // 지도 마커 클릭: 상세 팝업을 연다. 이미 열려 있으면 닫는다(토글).
  const handleDroneSelect = (droneId: string) => {
    if (openDetailDroneIds.includes(droneId)) {
      closeDroneDetail(droneId);
      if (selectedDroneId === droneId) {
        selectDrone(null);
      }
      return;
    }
    openDroneDetail(droneId);
  };

  // 좌측 드론 카드 클릭: 선택 + 해당 드론 위치로 지도만 이동(팝업은 열지 않음 —
  // 팝업은 카드의 "상세보기" 버튼(handleOpenDroneDetail)이 전담한다).
  const handleDroneCardSelect = (droneId: string) => {
    if (selectedDroneId === droneId) {
      selectDrone(null);
      return;
    }
    selectDrone(droneId);
    const target = displayDrones.find((drone) => drone.id === droneId);
    if (target) {
      setMapFocusRequest({
        coordinate: {
          latitude: target.currentPosition.latitude,
          longitude: target.currentPosition.longitude,
        },
        token: Date.now(),
      });
    }
  };

  // 드론 카드의 "상세보기" 버튼: 상세 팝업 열기
  const handleOpenDroneDetail = (droneId: string) => {
    openDroneDetail(droneId);
  };

  // 드론 제어 팝업 열기/닫기 — 드론마다 하나씩(각 객체) 뜬다.
  const openDroneControl = (droneId: string) => {
    setOpenControlDroneIds(addToList(droneId));
  };
  const closeDroneControl = (droneId: string) => {
    setOpenControlDroneIds(removeFromList(droneId));
  };

  // 중요상황기록 팝업 열기/닫기 — 드론마다 하나씩(각 객체) 뜬다.
  const openDroneEventLog = (droneId: string) => {
    setOpenEventLogDroneIds(addToList(droneId));
  };
  const closeDroneEventLog = (droneId: string) => {
    setOpenEventLogDroneIds(removeFromList(droneId));
  };

  // 표적 재클릭도 선택 해제
  const handleTargetSelect = (targetId: string) => {
    selectTarget(selectedTargetId === targetId ? null : targetId);
  };

  // 지도 빈 곳 클릭 → 선택만 해제(열어둔 상세 팝업은 각자 닫기 버튼으로 닫는다)
  const handleMapBlankClick = () => {
    selectDrone(null);
    selectTarget(null);
    closePopup();
  };

  // 항법 시스템 상태 카드·드론 제어 상태는 이제 상세/제어 팝업이 드론마다 스스로
  // 계산한다 — 여기서 선택 드론 하나만 계산하던 로직은 제거했다.
  const reportReference: ReportReference = useMemo(
    () => ({
      areaId: enemyArea.id,
      areaPosition: {
        latitude: enemyArea.latitude,
        longitude: enemyArea.longitude,
      },
      dronePosition: selectedDrone
        ? {
            latitude: selectedDrone.currentPosition.latitude,
            longitude: selectedDrone.currentPosition.longitude,
          }
        : undefined,
      targetPosition: selectedTarget?.position,
      scenarioId: activeScenarios[0]?.id,
    }),
    [activeScenarios, enemyArea, selectedDrone, selectedTarget],
  );
  const reportPosition = getReportPosition(reportReference);

  // 교란 자동 보고 — 위치 기록(백엔드 실시간 데이터)으로 교란 에피소드를 추적해
  // 진입 시 1건, 정상 복귀 시 분석 1건을 자동 전송한다. 전송은 기존 보고 계약 그대로이고,
  // 구조화된 분석(산점도·이미지·범위 예측)은 보고서 id로 로컬에 남겨 보고 상세에서 렌더한다.
  const sendAutoReport = useCallback(
    async (input: {
      title: string;
      content: string;
      important: boolean;
      droneId: string;
      clientRequestId: string;
      reportPosition: Coordinate;
    }) => {
      if (!areaId) {
        return null;
      }
      const report = await createReportMutation.mutateAsync({
        areaId,
        title: input.title,
        content: input.content,
        important: input.important,
        droneId: input.droneId,
        targetId: null,
        clientRequestId: input.clientRequestId,
        reportPosition: input.reportPosition,
        reference: reportReference,
      });
      return { id: report.id };
    },
    [areaId, createReportMutation, reportReference],
  );
  useInterferenceAutoReport({
    areaId,
    positionLog: droneTrackSnapshot.positionLog,
    droneNameById,
    droneFrameUrlById,
    areaPosition: {
      latitude: enemyArea.latitude,
      longitude: enemyArea.longitude,
    },
    sendReport: sendAutoReport,
  });

  // 키가 있고 SDK가 준비된 경우에만 실지도 사용, 그 외 전부 placeholder fallback
  const naverMapsSdkStatus = useNaverMapsSdk();
  const isRealMapActive = naverMapsSdkStatus === "ready";
  const activeLayerCount = Object.values(layers).filter(Boolean).length;
  const activeAreaIdRef = useRef<string | null>(areaId);
  const previousRuntimeAreaId = useRef<string | null>(null);

  useEffect(() => {
    activeAreaIdRef.current = areaId;
  }, [areaId]);

  // 교란(재밍/스푸핑) 경고는 더 이상 화면 상단 단일 배너로 띄우지 않는다 — 여러 드론이
  // 동시에 서로 다른 교란을 겪을 수 있어(예: A 재밍 + B 스푸핑 동시) 드론 카드마다
  // 자기 상황에 맞는 배너를 붙이는 방식(DroneList/DroneCard, droneTones 기반)으로 대체했다.

  useEffect(() => {
    realtimeObserver.recordConnectionState(realtimeConnectionState);
  }, [realtimeConnectionState, realtimeObserver]);

  useEffect(() => {
    if (!isOperationAreasLoaded) {
      return;
    }
    if (requestedAreaId !== null && isExplicitAreaIdValid) {
      setCurrentAreaId(requestedAreaId);
      return;
    }
    if (requestedAreaId !== null) {
      setCurrentAreaId(null);
    }
  }, [
    isExplicitAreaIdValid,
    isOperationAreasLoaded,
    requestedAreaId,
    setCurrentAreaId,
  ]);

  // 로그인 직후 기본값은 "미선택"이어야 하므로 첫 작전지역을 자동으로 채우지
  // 않는다 — 단, 이전에 선택해 둔(currentAreaId) 작전지역이 삭제 등으로 더 이상
  // 존재하지 않게 됐다면 그 잔여 참조만 정리한다(빈 값으로).
  useEffect(() => {
    if (!isOperationAreasLoaded || requestedAreaId !== null) {
      return;
    }
    if (
      currentAreaId !== null &&
      !operationAreas.some((area) => area.id === currentAreaId)
    ) {
      setCurrentAreaId(null);
    }
  }, [
    currentAreaId,
    isOperationAreasLoaded,
    operationAreas,
    requestedAreaId,
    setCurrentAreaId,
  ]);

  useEffect(() => {
    resetMapUi();
    closePopup();
  }, [areaId, closePopup, resetMapUi]);

  // 작전지역 변경 시 이전 이동 런타임·이벤트를 정리하고 새 Snapshot 기준으로 재구성한다.
  useEffect(() => {
    if (previousRuntimeAreaId.current !== areaId) {
      previousRuntimeAreaId.current = areaId;
      resetFlightArea(drones);
      return;
    }
    syncFlightDrones(drones);
  }, [areaId, drones, resetFlightArea, syncFlightDrones]);

  // 언마운트 시 requestAnimationFrame 루프 정리
  useEffect(() => {
    return () => disposeFlight();
  }, [disposeFlight]);

  // 시나리오 keyframe ↔ 로컬 이동 시뮬 위치 동기화.
  // - keyframe이 처음 도착한 드론: 로컬 이동을 멈추고 시나리오 위치에 정렬
  //   (지도에 로컬 경로/keyframe 위치가 동시에 그려져 어긋나는 문제 방지)
  // - keyframe이 사라진 드론(시나리오 종료/정리): 마지막 시나리오 위치에 정렬
  //   (종료 순간 이전 로컬 위치로 마커가 튀는 문제 방지)
  const lastScenarioPositionsRef = useRef<
    Record<string, ThreeDimensionalCoordinate>
  >({});
  useEffect(() => {
    lastScenarioPositionsRef.current = {};
  }, [areaId]);
  useEffect(() => {
    const remembered = lastScenarioPositionsRef.current;
    if (areaId && activeScenarioRunId) {
      const stillPresent = new Set<string>();
      const newlyDriven: Array<{
        droneId: string;
        position: ThreeDimensionalCoordinate;
      }> = [];
      for (const keyframe of Object.values(realtimeDroneKeyframes.keyframes)) {
        if (
          keyframe.areaId !== areaId ||
          keyframe.runId !== activeScenarioRunId
        ) {
          continue;
        }
        if (!(keyframe.droneId in remembered)) {
          newlyDriven.push({
            droneId: keyframe.droneId,
            position: keyframe.position,
          });
        }
        remembered[keyframe.droneId] = keyframe.position;
        stillPresent.add(keyframe.droneId);
      }
      const vanished = Object.keys(remembered).filter(
        (droneId) => !stillPresent.has(droneId),
      );
      if (vanished.length > 0) {
        alignFlightPositions(
          vanished.map((droneId) => ({
            droneId,
            position: remembered[droneId],
          })),
        );
        for (const droneId of vanished) {
          delete remembered[droneId];
        }
      }
      if (newlyDriven.length > 0) {
        alignFlightPositions(newlyDriven);
      }
      return;
    }
    const leftovers = Object.entries(remembered);
    if (leftovers.length > 0) {
      alignFlightPositions(
        leftovers.map(([droneId, position]) => ({ droneId, position })),
      );
      lastScenarioPositionsRef.current = {};
    }
  }, [
    areaId,
    activeScenarioRunId,
    realtimeDroneKeyframes,
    alignFlightPositions,
  ]);

  useEffect(() => {
    setLayer("drones", drones.length > 0);
    setLayer("targets", targets.length > 0);
    // scenarioEffectRadius(교란지역 범위)는 기본 on으로 두고 사용자의 토글을 그대로 따른다
    // — 실제 원 렌더링은 interferenceZone 데이터 존재 여부로 이미 게이팅되므로
    // 활성 시나리오가 없으면 자연히 아무것도 그려지지 않는다(강제 on/off 불필요).
  }, [drones.length, setLayer, targets.length]);

  useEffect(() => {
    if (selectedDroneId && !selectedDrone) {
      selectDrone(null);
    }
  }, [selectDrone, selectedDrone, selectedDroneId]);

  useEffect(() => {
    if (selectedTargetId && !selectedTarget) {
      selectTarget(null);
    }
  }, [selectTarget, selectedTarget, selectedTargetId]);

  // 작전지역 전환 시 지역 종속 UI 상태를 한곳에서 초기화한다.
  // (헤더 select와 지휘화면 BroadcastChannel 두 경로가 공유)
  const applyAreaChange = useCallback(
    (nextAreaId: string) => {
      setSearchParams({ areaId: nextAreaId });
      setCurrentAreaId(nextAreaId);
      resetMapUi();
      setPendingUnassignDroneId(null);
      setDroneActionMessage(null);
      setMapZoom(100);
      // 다른 작전지역 드론의 상세/제어/기록 팝업은 지역 전환 시 모두 닫는다.
      setOpenDetailDroneIds([]);
      setOpenControlDroneIds([]);
      setOpenEventLogDroneIds([]);
    },
    [resetMapUi, setCurrentAreaId, setSearchParams],
  );

  useEffect(
    () => subscribeEnemyAreaChange("operation-monitor", applyAreaChange),
    [applyAreaChange],
  );

  const updateDroneForm = (key: keyof DroneFormState, value: string | File | null) => {
    setDroneForm((prev) => ({ ...prev, [key]: value }));
    setDroneFormMessage(null);
  };

  const updateDroneImageFile = (
    key: "iconImageFile" | "cardImageFile",
    file: File | null,
  ) => {
    const nextPreviewUrl = file ? URL.createObjectURL(file) : null;

    if (key === "iconImageFile") {
      if (iconPreviewUrl) {
        URL.revokeObjectURL(iconPreviewUrl);
      }
      setIconPreviewUrl(nextPreviewUrl);
    } else {
      if (cardPreviewUrl) {
        URL.revokeObjectURL(cardPreviewUrl);
      }
      setCardPreviewUrl(nextPreviewUrl);
    }

    updateDroneForm(key, file);
  };

  const handleDroneAddSubmit = () => {
    if (!areaId) {
      setDroneFormMessage("드론을 등록할 작전지역를 먼저 선택하세요.");
      return;
    }
    if (isDroneLimitReached) {
      setDroneFormMessage(`작전지역에는 최대 ${MAX_DRONES_PER_ENEMY_AREA}대의 드론만 등록할 수 있습니다.`);
      return;
    }

    const parsed = droneCreateSchema.safeParse({
      name: droneForm.name,
      model: droneForm.model || undefined,
      missionType: droneForm.missionType || undefined,
      departureLatitude: toOptionalNumber(droneForm.departureLatitude),
      departureLongitude: toOptionalNumber(droneForm.departureLongitude),
      departureAltitude: toOptionalNumber(droneForm.departureAltitude),
      iconImageFile: droneForm.iconImageFile,
      cardImageFile: droneForm.cardImageFile,
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setDroneFormErrors({
        name: getFirstFieldError(fieldErrors.name),
        model: getFirstFieldError(fieldErrors.model),
        missionType: getFirstFieldError(fieldErrors.missionType),
        departureLatitude: getFirstFieldError(fieldErrors.departureLatitude),
        departureLongitude: getFirstFieldError(fieldErrors.departureLongitude),
        departureAltitude: getFirstFieldError(fieldErrors.departureAltitude),
        iconImageFile: getFirstFieldError(fieldErrors.iconImageFile),
        cardImageFile: getFirstFieldError(fieldErrors.cardImageFile),
      });
      setDroneFormMessage("입력값을 확인하세요.");
      return;
    }

    setDroneFormErrors({});
    setDroneFormMessage(null);
    const iconFile = droneForm.iconImageFile;
    const cardFile = droneForm.cardImageFile;
    createDroneMutation.mutate(
      {
        areaId,
        name: parsed.data.name,
        model: parsed.data.model,
        missionType: parsed.data.missionType,
        departureLatitude: parsed.data.departureLatitude,
        departureLongitude: parsed.data.departureLongitude,
        departureAltitude: parsed.data.departureAltitude,
      },
      {
        onSuccess: (drone, input) => {
          if (activeAreaIdRef.current !== input.areaId) {
            return;
          }
          if (iconPreviewUrl) {
            URL.revokeObjectURL(iconPreviewUrl);
          }
          if (cardPreviewUrl) {
            URL.revokeObjectURL(cardPreviewUrl);
          }
          setDroneForm(emptyDroneForm);
          setIconPreviewUrl(null);
          setCardPreviewUrl(null);
          setDroneFormMessage(`${drone.name} 드론이 등록되었습니다.`);
          setDroneActionMessage(`${drone.name} 드론이 등록되었습니다.`);

          if (iconFile || cardFile) {
            void uploadDroneImagesBestEffort(drone.id, iconFile, cardFile).then(
              (failedLabels) => {
                if (activeAreaIdRef.current !== input.areaId) {
                  return;
                }
                if (failedLabels.length > 0) {
                  setDroneActionMessage(
                    `${drone.name} 등록됨 — ${failedLabels.join(", ")} 업로드 실패`,
                  );
                } else {
                  setDroneActionMessage(
                    `${drone.name} 드론 등록 및 이미지 업로드가 완료되었습니다.`,
                  );
                }
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.operationSnapshot(input.areaId),
                });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.drones,
                });
              },
            );
          }
        },
        onError: (error, input) => {
          if (activeAreaIdRef.current !== input.areaId) {
            return;
          }
          setDroneFormMessage(
            getMutationErrorMessage(error, "드론 등록 요청이 실패했습니다."),
          );
        },
      },
    );
  };

  const handleDroneModalClose = () => {
    closeDroneAddModal();
    setDroneForm(emptyDroneForm);
    setDroneFormErrors({});
    setDroneFormMessage(null);
    if (iconPreviewUrl) {
      URL.revokeObjectURL(iconPreviewUrl);
    }
    if (cardPreviewUrl) {
      URL.revokeObjectURL(cardPreviewUrl);
    }
    setIconPreviewUrl(null);
    setCardPreviewUrl(null);
  };

  const handleUnassignDroneRequest = (droneId: string) => {
    setDroneActionMessage(null);
    setPendingUnassignDroneId(droneId);
  };

  const handleUnassignDroneConfirm = () => {
    if (!areaId || !pendingUnassignDrone || unassignDroneMutation.isPending) {
      return;
    }

    unassignDroneMutation.mutate(
      {
        areaId,
        droneId: pendingUnassignDrone.id,
      },
      {
        onSuccess: (drone, input) => {
          if (activeAreaIdRef.current !== input.areaId) {
            return;
          }
          removeFlightDrone(drone.id);
          // 배정 해제된 드론의 상세/제어/기록 팝업을 모두 닫는다.
          closeDroneDetail(drone.id);
          if (drone.id === selectedDroneId) {
            selectDrone(null);
            closePopup();
          }
          setPendingUnassignDroneId(null);
          setDroneActionMessage(`${drone.name} 드론 배정이 해제되었습니다.`);
        },
        onError: (error, input) => {
          if (activeAreaIdRef.current !== input.areaId) {
            return;
          }
          setDroneActionMessage(
            getMutationErrorMessage(
              error,
              "드론 배정 해제 요청이 실패했습니다.",
            ),
          );
          setPendingUnassignDroneId(null);
        },
      },
    );
  };

  const handleOpenReportModal = () => {
    setReportForm({
      ...emptyReportForm,
      linkedDroneId: selectedDrone?.id ?? "",
    });
    setReportMessage(null);
    openReportModal();
  };

  const handleReportModalClose = () => {
    if (createReportMutation.isPending) {
      return;
    }
    closeReportModal();
    setReportMessage(null);
  };

  const canSubmitReport =
    areaId !== null &&
    reportForm.title.trim().length > 0 &&
    reportForm.content.trim().length > 0 &&
    !createReportMutation.isPending;

  const handleReportSubmit = () => {
    if (!areaId) {
      setReportMessage("보고할 작전지역이 없습니다.");
      return;
    }
    if (!canSubmitReport) {
      setReportMessage("제목과 내용을 입력하세요.");
      return;
    }

    createReportMutation.mutate(
      {
        areaId,
        title: reportForm.title.trim(),
        content: reportForm.content.trim(),
        important: reportForm.important,
        droneId: reportForm.linkedDroneId || null,
        targetId: selectedTarget?.id ?? null,
        clientRequestId: createClientRequestId("report"),
        reportPosition: {
          latitude: reportPosition.latitude,
          longitude: reportPosition.longitude,
        },
        reference: reportReference,
      },
      {
        onSuccess: (report) => {
          closeReportModal();
          setReportForm(emptyReportForm);
          setReportMessage(null);
          setDroneActionMessage(`상황 보고 '${report.title}'가 전송되었습니다.`);
        },
        onError: (error) => {
          setReportMessage(
            getMutationErrorMessage(error, "상황 보고 전송이 실패했습니다."),
          );
        },
      },
    );
  };

  // 지휘화면(CommandReportPage)과 같은 방식: 종류별로 창을 하나만 재사용한다.
  const openReportWindow = () => {
    window.open("/reports", "command-report");
  };
  const openScenarioWindowForCurrentArea = () => {
    if (!areaId) {
      return;
    }
    window.open(`/scenario?areaId=${areaId}`, "scenario-simulator");
    window.setTimeout(
      () => postEnemyAreaChange("scenario-simulator", areaId),
      50,
    );
  };

  const handleAreaCreateSubmit = (input: EnemyAreaCreateInput) => {
    setAreaCreateMessage(null);
    createAreaMutation.mutate(input, {
      onSuccess: (area) => {
        setIsAreaCreateModalOpen(false);
        applyAreaChange(area.id);
        setDroneActionMessage(`'${area.name}' 작전지역이 생성되었습니다.`);
      },
      onError: (error) => {
        setAreaCreateMessage(
          getMutationErrorMessage(error, "작전지역 생성이 실패했습니다."),
        );
      },
    });
  };

  const handleApplyScenarioTemplate = () => {
    if (!areaId || !selectedScenarioTemplate || !canApplyScenarioTemplate) {
      return;
    }
    const templateConfig = selectedScenarioTemplate.config;
    // 실행 요청 config는 백엔드 원본(rawConfig)을 그대로 보낸다 — STP-DATASET-DEMO의
    // mode·droneDatasetPrefixes·droneEffects 같은 백엔드 소유 필드가 손실되지 않게 한다.
    // scenarioType은 config 판별자(type)로 정한다.
    const request: unknown = {
      areaId,
      scenarioType: templateConfig.type,
      config: selectedScenarioTemplate.rawConfig,
      interferenceZone: selectedScenarioTemplate.interferenceZone,
    };
    const parsed = safeParseScenarioRunRequest(request);
    if (!parsed.success) {
      showScenarioActionMessage("선택한 템플릿의 설정을 확인하세요.");
      return;
    }
    setScenarioActionMessage(null);
    createScenarioRunMutation.mutate(parsed.data, {
      onSuccess: (run, input) => {
        if (activeAreaIdRef.current !== input.areaId) {
          return;
        }
        showScenarioActionMessage(`${run.id} 실행이 시작되었습니다.`);
      },
      onError: (error, input) => {
        if (activeAreaIdRef.current !== input.areaId) {
          return;
        }
        showScenarioActionMessage(
          getMutationErrorMessage(error, "시나리오 실행 요청이 실패했습니다."),
        );
      },
    });
  };

  const handleStopActiveScenario = () => {
    if (!activeScenarioRun || stopScenarioRunMutation.isPending) {
      return;
    }
    const input = { runId: activeScenarioRun.id, areaId: activeScenarioRun.areaId };
    setScenarioActionMessage(null);
    stopScenarioRunMutation.mutate(input, {
      onSuccess: (run, request) => {
        if (activeAreaIdRef.current !== request.areaId) {
          return;
        }
        showScenarioActionMessage(`${run.id} 중지 요청이 전송되었습니다.`);
      },
      onError: (error, request) => {
        if (activeAreaIdRef.current !== request.areaId) {
          return;
        }
        showScenarioActionMessage(
          getMutationErrorMessage(error, "시나리오 중지 요청이 실패했습니다."),
        );
      },
    });
  };

  const operationError =
    operationAreasQuery.error ?? (areaId ? snapshotQuery.error : null);

  // 헤더의 "현재 시각(KST)" 표시용 — 항상 최신 시각을 보여줘야 하므로 1초 간격으로 갱신된다.
  const clock = useKstClock();

  // 헤더는 작전지역 선택 여부와 무관하게 항상 보여야 한다 — 로그인 직후 "아무 것도
  // 선택 안 된" 기본 상태에서도 헤더의 작전지역 선택/생성 버튼으로 시작할 수 있어야
  // 하기 때문이다. 아래 여러 반환 분기(로딩/에러/미선택/본문)가 모두 이 두 요소를
  // 공유한다 — JSX를 분기마다 복붙하는 대신 변수로 한 번만 선언해 재사용한다.
  const headerElement = (
    <header className="app-header app-header--ops">
        <div className="app-header__brand">
          <BrandLogo size={40} />
          <div className="app-header__brand-text">
            <span className="app-header__title">드론 통합 관제 시스템</span>
            <span className="app-header__eyebrow">
              Drone Integrated Monitoring System
            </span>
          </div>
        </div>
        {/* 화면 전환 바로가기 — 왼쪽에 배치, 지휘화면/시나리오화면을 각각 창 하나로 재사용 */}
        <nav className="app-header__view-links" aria-label="화면 전환">
          <button type="button" onClick={openReportWindow}>
            보고화면
          </button>
          <span className="app-header__view-links-divider" aria-hidden="true">
            |
          </span>
          <button
            type="button"
            disabled={!areaId}
            onClick={openScenarioWindowForCurrentArea}
          >
            시나리오생성
          </button>
        </nav>
        {/* 작전지역 좌표 · 현재 시각 — 작전지역이 선택된 경우에만 의미가 있다 */}
        {areaId !== null ? (
          <div className="app-header__status">
            <span className="app-header__status-item">
              <span className="app-header__status-label">작전지역 좌표</span>
              <span className="app-header__status-value">
                {enemyArea.latitude.toFixed(5)}, {enemyArea.longitude.toFixed(5)}
              </span>
            </span>
            <span className="app-header__status-divider" />
            <span className="app-header__status-item app-header__status-item--clock">
              <span className="app-header__status-label">현재 시각 (KST)</span>
              <span className="app-header__status-value">{clock}</span>
            </span>
          </div>
        ) : null}
        <div className="app-header__actions">
          {activeScenarioRun ? (
            <PrimaryButton
              size="sm"
              disabled={
                activeScenarioRun.status === "STOPPING" ||
                stopScenarioRunMutation.isPending
              }
              onClick={handleStopActiveScenario}
              title={scenarioActionMessage ?? undefined}
            >
              {stopScenarioRunMutation.isPending
                ? "중지 요청 중..."
                : "시나리오 중지"}
            </PrimaryButton>
          ) : scenarioTemplates.length > 0 ? (
            <>
              <SelectInput
                aria-label="적용할 시나리오 템플릿"
                className="app-header__template-select"
                value={selectedScenarioTemplate?.id ?? ""}
                onChange={(event) => setSelectedScenarioTemplateId(event.target.value)}
                options={scenarioTemplates.map((template) => ({
                  value: template.id,
                  label: `${template.name} · ${
                    template.scenarioType === "JAMMING" ? "재밍" : "스푸핑"
                  }`,
                }))}
              />
              <PrimaryButton
                size="sm"
                disabled={!canApplyScenarioTemplate}
                onClick={handleApplyScenarioTemplate}
                title={
                  drones.length === 0
                    ? "현재 작전지역에 배정된 드론이 없습니다."
                    : (scenarioActionMessage ?? undefined)
                }
              >
                {createScenarioRunMutation.isPending
                  ? "실행 요청 중..."
                  : "▶ 시나리오 실행"}
              </PrimaryButton>
            </>
          ) : null}
          <SecondaryButton
            size="sm"
            onClick={() => {
              setAreaCreateMessage(null);
              setIsAreaCreateModalOpen(true);
            }}
          >
            + 작전지역 생성
          </SecondaryButton>
          <SelectInput
            className="app-header__area-select"
            aria-label="작전지역 선택"
            placeholder="작전지역 선택"
            options={operationAreaOptions}
            value={areaId ?? ""}
            disabled={operationAreaOptions.length === 0}
            onChange={(event) => applyAreaChange(event.target.value)}
          />
        </div>
        {scenarioActionMessage ? (
          <p className="app-header__toast" role="status">
            {scenarioActionMessage}
          </p>
        ) : null}
      </header>
  );

  const areaCreateModalElement = isAreaCreateModalOpen ? (
    <ModalShell
      title="작전지역 생성"
      description="새 작전지역을 생성합니다. 생성 후 바로 이 작전지역으로 전환됩니다."
      footer={null}
      onClose={() => {
        if (createAreaMutation.isPending) {
          return;
        }
        setIsAreaCreateModalOpen(false);
      }}
    >
      <AreaCreateForm
        onCreate={handleAreaCreateSubmit}
        isSubmitting={createAreaMutation.isPending}
      />
      {areaCreateMessage ? (
        <p className="control-hint">{areaCreateMessage}</p>
      ) : null}
    </ModalShell>
  ) : null;

  if (operationError) {
    return (
      <div className="page page--viewport">
        {headerElement}
        <div className="page-body operation-page-body">
          <ErrorState
            title="작전지 데이터를 불러오지 못했습니다."
            description={getOperationErrorMessage(operationError)}
            action={
              <PrimaryButton
                onClick={() => {
                  void operationAreasQuery.refetch();
                  void snapshotQuery.refetch();
                }}
              >
                다시 시도
              </PrimaryButton>
            }
          />
        </div>
        {areaCreateModalElement}
      </div>
    );
  }

  if (operationAreasQuery.isLoading) {
    return (
      <div className="page page--viewport">
        {headerElement}
        <div className="page-body operation-page-body">
          <EmptyState
            title="작전지 데이터를 불러오는 중입니다."
            description="등록된 작전지역 목록을 확인하고 있습니다."
          />
        </div>
        {areaCreateModalElement}
      </div>
    );
  }

  if (areaId === null) {
    const emptyTitle = !hasOperationAreas
      ? "등록된 작전지역이 없습니다."
      : hadExplicitAreaRequest
        ? "작전지역을 선택할 수 없습니다."
        : "작전지역을 선택해주세요.";
    const emptyDescription = !hasOperationAreas
      ? "등록된 작전지역이 없습니다. 헤더의 '+ 작전지역 생성' 버튼으로 먼저 작전지역을 만들어주세요."
      : hadExplicitAreaRequest
        ? "요청한 작전지역이 존재하지 않습니다. 헤더에서 작전지역을 다시 선택해주세요."
        : "헤더의 작전지역 선택 목록에서 모니터링할 작전지역을 골라주세요.";
    return (
      <div className="page page--viewport">
        {headerElement}
        <div className="page-body operation-page-body">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
        {areaCreateModalElement}
      </div>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <div className="page page--viewport">
        {headerElement}
        <div className="page-body operation-page-body">
          <EmptyState
            title="작전지 데이터를 불러오는 중입니다."
            description="백엔드 snapshot 응답을 기다리고 있습니다."
          />
        </div>
        {areaCreateModalElement}
      </div>
    );
  }

  return (
    <div className="page page--viewport">
      {headerElement}

      <div className="page-body operation-page-body">
        <div className="operation-stage">
          {/* 기반 레이어: 메인 지도 (stage 전체를 채운다) */}
          <div className="operation-stage__map">
            {isRealMapActive ? (
              <OperationNaverMap
                area={enemyArea}
                drones={displayDrones}
                targets={visibleTargets}
                selectedDroneId={selectedDroneId}
                mapMode={mapMode}
                layers={layers}
                flightRuntimes={flightRuntimes}
                interferenceZone={interferenceZone}
                droneTones={droneTones}
                droneTracks={droneTracks}
                droneRoutes={droneRoutes}
                hasActiveInterference={hasActiveInterference}
                focusRequest={mapFocusRequest}
                onDroneSelect={handleDroneSelect}
                onTargetSelect={handleTargetSelect}
                onMapClick={handleMapBlankClick}
                onViewportChange={setMapViewportBounds}
              />
            ) : (
              <OperationMapPlaceholder
                area={enemyArea}
                drones={displayDrones}
                targets={visibleTargets}
                selectedDroneId={selectedDroneId}
                selectedTargetId={selectedTargetId}
                activePopupId={activePopupId}
                mapMode={mapMode}
                layers={layers}
                hideNote
                hideFooter
                zoom={mapZoom}
                flightRuntimes={flightRuntimes}
                onDroneSelect={handleDroneSelect}
                onTargetSelect={handleTargetSelect}
                onPopupOpen={setActivePopupId}
                onPopupClose={closePopup}
                onOpenDroneControl={openDroneControl}
              />
            )}
          </div>

          {/* 드론 상세 팝업 — 드론마다 하나씩 독립적으로(각 객체) 뜬다.
              실지도 전용(placeholder는 자체 팝업 시스템을 쓴다).
              배정 해제 등으로 사라진 드론은 렌더 시점에 걸러 자동으로 닫힌다. */}
          {isRealMapActive
            ? openDetailDroneIds
                .filter((droneId) =>
                  displayDrones.some((drone) => drone.id === droneId),
                )
                .map((droneId, index) => {
                const detailDrone = displayDrones.find(
                  (drone) => drone.id === droneId,
                );
                if (!detailDrone) {
                  return null;
                }
                const track =
                  areaId && activeScenarioRunId
                    ? selectRealtimeDroneTrack(
                        droneTrackSnapshot,
                        areaId,
                        activeScenarioRunId,
                        droneId,
                      )
                    : undefined;
                const runtimeStatus =
                  activeRuntimeStatuses.find(
                    (status) => status.droneId === droneId,
                  ) ?? null;
                const metrics = buildDroneRuntimeMetrics(
                  track,
                  detailDrone.currentPosition,
                );
                const view = areaId
                  ? selectRealtimeDroneView(droneViewSnapshot, areaId, droneId)
                  : undefined;
                // 시나리오 라이브 프레임이 없으면 드론 현재 좌표에 가장 가까운
                // 정상 경로 프레임 이미지를 대신 보여준다(실행 전에도 이미지가 계속 나오게).
                const liveViewImageUrl = view?.viewImageUrl
                  ? view.viewImageUrl
                  : null;
                const routeFrames = droneMatchedRoutes[droneId]?.frames;
                const routeViewImageUrl =
                  !liveViewImageUrl && routeFrames
                    ? pickNearestRouteFrameImage(
                        routeFrames,
                        detailDrone.currentPosition,
                      )
                    : null;
                const isRoutePreview =
                  !liveViewImageUrl && Boolean(routeViewImageUrl);
                return (
                  <DroneDetailPopup
                    key={droneId}
                    className="op-drone-popup"
                    cascadeIndex={index}
                    drone={detailDrone}
                    runtimeTone={droneTones[droneId] ?? "normal"}
                    metrics={metrics}
                    viewImageUrl={liveViewImageUrl ?? routeViewImageUrl}
                    viewStatus={view?.status ?? null}
                    isRoutePreview={isRoutePreview}
                    navCards={buildDroneNavCards(
                      detailDrone,
                      runtimeStatus,
                      metrics,
                    )}
                    path={
                      track
                        ? track.truePath.map((point) => point.position)
                        : []
                    }
                    movementTarget={detailDrone.movementTarget ?? null}
                    area={{
                      center: enemyArea,
                      radiusMeters: enemyArea.radiusMeters,
                    }}
                    showFocusMap={isRealMapActive}
                    onClose={() => closeDroneDetail(droneId)}
                    onOpenDroneView={() => openDroneViewWindow(droneId)}
                    onOpenDroneControl={() => openDroneControl(droneId)}
                    onOpenEventLog={() => openDroneEventLog(droneId)}
                  />
                );
              })
            : null}

          {/* 드론 제어 팝업 — 드론마다 하나씩(각 객체) 뜬다. 각 팝업은 자기 이동 입력
              폼·지도 피커·명령 상태를 스스로 소유한다. 사라진 드론은 걸러 자동으로 닫힌다. */}
          {openControlDroneIds
            .filter((droneId) =>
              displayDrones.some((drone) => drone.id === droneId),
            )
            .map((droneId, index) => {
              const controlDrone = displayDrones.find(
                (drone) => drone.id === droneId,
              );
              if (!controlDrone) {
                return null;
              }
              return (
                <OperationDroneControlPopup
                  key={droneId}
                  drone={controlDrone}
                  areaId={areaId}
                  areaCenter={{
                    latitude: enemyArea.latitude,
                    longitude: enemyArea.longitude,
                  }}
                  isRealMapActive={isRealMapActive}
                  isScenarioDriven={scenarioDrivenIds.has(droneId)}
                  flightRuntime={flightRuntimes[droneId]}
                  cascadeIndex={index}
                  routeWaypoints={droneRouteWaypoints[droneId] ?? EMPTY_WAYPOINTS}
                  applyMove={applyMove}
                  followRoute={followRoute}
                  pauseFlight={pauseFlight}
                  resumeFlight={resumeFlight}
                  hoverFlight={hoverFlight}
                  returnFlight={returnFlight}
                  onClose={() => closeDroneControl(droneId)}
                />
              );
            })}

          {/* 중요상황기록 팝업 — 드론마다 하나씩(각 객체) 뜬다. 드론 제어 팝업과 같은
              지도 위 드래그 오버레이 형태로, 해당 드론의 위치 기록/운용 이벤트만 보여준다. */}
          {openEventLogDroneIds
            .filter((droneId) =>
              displayDrones.some((drone) => drone.id === droneId),
            )
            .map((droneId, index) => {
              const logDrone = displayDrones.find(
                (drone) => drone.id === droneId,
              );
              if (!logDrone) {
                return null;
              }
              return (
                <OperationEventLogPopup
                  key={droneId}
                  droneName={logDrone.name}
                  positionEntries={positionLogByDrone[droneId] ?? []}
                  eventEntries={eventLogByDrone[droneId] ?? []}
                  cascadeIndex={index}
                  onClose={() => closeDroneEventLog(droneId)}
                />
              );
            })}

          {/* 선택 표적 상세 팝업 — 드론 상세 팝업과 동일한 조건: 선택 시에만 표시, 드래그 가능 */}
          {selectedTarget ? (
            <TargetInfoPopup
              className="op-target-popup"
              target={selectedTarget}
              targets={visibleTargets}
              onSelectTarget={handleTargetSelect}
              onClose={() => selectTarget(null)}
            />
          ) : null}


          {/* 지도 안내 배지 (좌상단 오버레이) */}
          <span className="op-mapnote">
            {mapMode === "satellite" ? "위성" : "일반"} ·{" "}
            {isRealMapActive
              ? "네이버 지도"
              : naverMapsSdkStatus === "error"
                ? "시뮬레이션 지도 · 지도 로드 실패로 대체 표시 중"
                : "시뮬레이션 지도 · 실제 지도 미연결"}
          </span>

          {/* 우상단 오버레이 묶음: 미니맵 위, 지도 도구(모드+레이어) 아래 */}
          <div className="op-top-right-stack">
            {/* 미니맵: 현재 메인 지도가 보여주는 영역을 사각형으로 함께 표시 (버튼으로 열고 닫기) */}
            {isMinimapOpen ? (
              <div className="op-minimap-panel">
                <span className="op-minimap-panel__title">미니맵</span>
                {isRealMapActive ? (
                  <OperationNaverMiniMap
                    area={enemyArea}
                    drones={displayDrones}
                    targets={visibleTargets}
                    interferenceZone={interferenceZone}
                    droneTones={droneTones}
                    viewportBounds={mapViewportBounds}
                    onFocus={(coordinate) =>
                      setMapFocusRequest({ coordinate, token: Date.now() })
                    }
                  />
                ) : (
                  <OperationMiniMap
                    area={enemyArea}
                    drones={displayDrones}
                    targets={visibleTargets}
                    layers={layers}
                    activeScenarioRun={activeScenarioRun}
                  />
                )}
              </div>
            ) : null}

            <div className="op-maptools">
              <button
                type="button"
                className={`layer-menu__button${isMinimapOpen ? " is-open" : ""}`}
                aria-expanded={isMinimapOpen}
                onClick={() => setIsMinimapOpen((open) => !open)}
              >
                미니맵
              </button>
              <SelectInput
                aria-label="지도 모드"
                value={mapMode}
                options={[
                  { value: "normal", label: "일반 지도" },
                  { value: "satellite", label: "위성 지도" },
                ]}
                onChange={(event) =>
                  setMapMode(event.target.value as "normal" | "satellite")
                }
              />
              <div className="layer-menu">
                <button
                  type="button"
                  className={`layer-menu__button${
                    isLayerMenuOpen ? " is-open" : ""
                  }`}
                  aria-expanded={isLayerMenuOpen}
                  onClick={() => setIsLayerMenuOpen((open) => !open)}
                >
                  레이어
                  <span className="layer-menu__count">{activeLayerCount}</span>
                </button>
                {isLayerMenuOpen ? (
                  <div className="layer-menu__popover" role="menu">
                    {Object.entries(layers).map(([layerName, isActive]) => (
                      <button
                        key={layerName}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={isActive}
                        className={`layer-menu__item${
                          isActive ? " is-active" : ""
                        }`}
                        onClick={() =>
                          toggleLayer(layerName as keyof typeof layers)
                        }
                      >
                        <span className="layer-menu__dot" />
                        {getMapLayerLabel(layerName)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* 지도 배율 컨트롤 (좌하단 오버레이): placeholder CSS 배율 전용.
              실지도는 자체 줌(휠/제스처)을 쓰므로 숨긴다. */}
          {isRealMapActive ? null : (
          <div className="op-zoom" role="group" aria-label="지도 배율">
            <button
              type="button"
              className="op-zoom__btn"
              aria-label="축소"
              disabled={mapZoom <= 70}
              onClick={zoomOut}
            >
              −
            </button>
            <span className="op-zoom__value">{mapZoom}%</span>
            <button
              type="button"
              className="op-zoom__btn"
              aria-label="확대"
              disabled={mapZoom >= 160}
              onClick={zoomIn}
            >
              +
            </button>
            <button
              type="button"
              className="op-zoom__reset"
              onClick={zoomReset}
            >
              초기화
            </button>
          </div>
          )}

          {/* 좌측 오버레이: 드론 상태 + 표적 정보 — '<<'/'>>' 버튼으로 슬라이드 인/아웃 */}
          <div
            className={`op-col op-col--left${
              isLeftPanelCollapsed ? " op-col--left-collapsed" : ""
            }`}
          >
            <button
              type="button"
              className="op-col-left__toggle"
              aria-label={isLeftPanelCollapsed ? "패널 펼치기" : "패널 접기"}
              aria-expanded={!isLeftPanelCollapsed}
              onClick={() => setIsLeftPanelCollapsed((collapsed) => !collapsed)}
            >
              {isLeftPanelCollapsed ? "»" : "«"}
            </button>
            <AppPanel
              className="op-panel operation-drone-panel"
              header={
                <PanelHeader
                  title="드론 상태"
                  subtitle={`총 ${drones.length}대`}
                  actions={
                    <div className="drone-panel__actions">
                      <StatusBadge
                        tone={drones.length > 0 ? "primary" : "neutral"}
                      >
                        {drones.length}/{MAX_DRONES_PER_ENEMY_AREA}
                      </StatusBadge>
                      <IconButton
                        label="상황 보고 작성"
                        icon="📝"
                        onClick={handleOpenReportModal}
                      />
                      <IconButton
                        label="드론 추가"
                        icon="+"
                        disabled={isDroneLimitReached || createDroneMutation.isPending}
                        onClick={openDroneAddModal}
                      />
                    </div>
                  }
                />
              }
              bodyClassName="scroll-body"
            >
              <DroneList
                drones={displayDrones}
                selectedDroneId={selectedDroneId}
                droneTones={droneTones}
                onSelect={handleDroneCardSelect}
                onOpenDetail={handleOpenDroneDetail}
                onUnassign={handleUnassignDroneRequest}
                emptyAction={
                  <PrimaryButton
                    size="sm"
                    disabled={isDroneLimitReached || createDroneMutation.isPending}
                    onClick={openDroneAddModal}
                  >
                    드론 추가
                  </PrimaryButton>
                }
              />
              {isDroneLimitReached ? (
                <p className="control-hint">
                  작전지역별 드론은 최대 {MAX_DRONES_PER_ENEMY_AREA}대까지 배정할 수 있습니다.
                </p>
              ) : null}
              {droneActionMessage ? (
                <p className="control-hint">{droneActionMessage}</p>
              ) : null}
            </AppPanel>
          </div>

          {/* 실시간 이벤트 관찰(디버그 도구): ?debug=1 일 때만 표시 */}
          {import.meta.env.DEV && searchParams.get("debug") === "1" ? (
            <RealtimeEventMonitor />
          ) : null}
        </div>
      </div>

      <ConfirmModal
        open={pendingUnassignDrone !== null}
        title="드론 배정 해제"
        description={
          pendingUnassignDrone
            ? `${pendingUnassignDrone.name} 드론을 현재 작전지역에서 배정 해제합니다.`
            : undefined
        }
        confirmLabel={
          unassignDroneMutation.isPending ? "해제 중..." : "배정 해제"
        }
        tone="danger"
        onConfirm={handleUnassignDroneConfirm}
        onClose={() => {
          if (!unassignDroneMutation.isPending) {
            setPendingUnassignDroneId(null);
          }
        }}
      />

      <FormModal
        open={isDroneAddModalOpen}
        wide
        title="드론 추가"
        description={
          isDroneLimitReached
            ? `현재 작전지역는 최대 ${MAX_DRONES_PER_ENEMY_AREA}대가 배정되어 있습니다.`
            : "작전지역에 드론을 배정합니다. 출발 좌표는 필수입니다."
        }
        submitLabel={createDroneMutation.isPending ? "등록 중..." : "드론 등록"}
        submitDisabled={isDroneLimitReached || createDroneMutation.isPending}
        onSubmit={handleDroneAddSubmit}
        onClose={handleDroneModalClose}
      >
        <TextInput
          label="드론 이름"
          required
          placeholder="예: 정찰 드론 1"
          value={droneForm.name}
          error={droneFormErrors.name}
          onChange={(event) => updateDroneForm("name", event.target.value)}
        />
        <div className="ui-form-row">
          <TextInput
            label="모델"
            placeholder="Scout-A"
            value={droneForm.model}
            error={droneFormErrors.model}
            onChange={(event) => updateDroneForm("model", event.target.value)}
          />
          <TextInput
            label="임무 유형"
            placeholder="정찰"
            value={droneForm.missionType}
            error={droneFormErrors.missionType}
            onChange={(event) =>
              updateDroneForm("missionType", event.target.value)
            }
          />
        </div>
        <div className="ui-form-row">
          <NumberInput
            label="출발 위도"
            required
            step="any"
            value={droneForm.departureLatitude}
            error={droneFormErrors.departureLatitude}
            onChange={(event) =>
              updateDroneForm("departureLatitude", event.target.value)
            }
          />
          <NumberInput
            label="출발 경도"
            required
            step="any"
            value={droneForm.departureLongitude}
            error={droneFormErrors.departureLongitude}
            onChange={(event) =>
              updateDroneForm("departureLongitude", event.target.value)
            }
          />
        </div>
        {isRealMapActive ? (
          <SecondaryButton
            block
            size="sm"
            onClick={() => setIsDeparturePickerOpen(true)}
          >
            지도에서 출발 좌표 선택
          </SecondaryButton>
        ) : null}
        <NumberInput
          label="출발 고도"
          unit="m"
          required
          min={0}
          value={droneForm.departureAltitude}
          error={droneFormErrors.departureAltitude}
          onChange={(event) =>
            updateDroneForm("departureAltitude", event.target.value)
          }
        />
        <div className="ui-form-row">
          <label className="ui-field">
            <span className="ui-field__label">지도 이미지</span>
            <input
              className="ui-field__control"
              type="file"
              accept="image/png,image/jpg,image/jpeg,image/svg+xml"
              onChange={(event) =>
                updateDroneImageFile(
                  "iconImageFile",
                  event.target.files?.[0] ?? null,
                )
              }
            />
            {droneFormErrors.iconImageFile ? (
              <span className="ui-field__hint ui-field__hint--error">
                {droneFormErrors.iconImageFile}
              </span>
            ) : null}
          </label>
          <label className="ui-field">
            <span className="ui-field__label">카드 이미지</span>
            <input
              className="ui-field__control"
              type="file"
              accept="image/png,image/jpg,image/jpeg,image/svg+xml"
              onChange={(event) =>
                updateDroneImageFile(
                  "cardImageFile",
                  event.target.files?.[0] ?? null,
                )
              }
            />
            {droneFormErrors.cardImageFile ? (
              <span className="ui-field__hint ui-field__hint--error">
                {droneFormErrors.cardImageFile}
              </span>
            ) : null}
          </label>
        </div>
        <div className="drone-preview-row">
          <span>지도 이미지: {iconPreviewUrl ? "미리보기 준비됨" : "기본 마커 사용"}</span>
          {iconPreviewUrl ? (
            <img src={iconPreviewUrl} alt="지도 이미지 미리보기" />
          ) : null}
          <span>카드 이미지: {cardPreviewUrl ? "미리보기 준비됨" : "기본 이미지 사용"}</span>
          {cardPreviewUrl ? (
            <img src={cardPreviewUrl} alt="카드 이미지 미리보기" />
          ) : null}
        </div>
        {droneFormMessage ? (
          <p className="control-hint">{droneFormMessage}</p>
        ) : null}
      </FormModal>

      <FormModal
        open={isReportModalOpen}
        wide
        title="상황 보고 작성"
        description="현재 작전지역, 선택 드론, 선택 표적 기준으로 상황 보고를 작성합니다."
        submitLabel={
          createReportMutation.isPending ? "전송 중..." : "보고 전송"
        }
        submitDisabled={!canSubmitReport}
        onSubmit={handleReportSubmit}
        onClose={handleReportModalClose}
      >
        <TextInput
          label="제목"
          required
          placeholder="보고 제목"
          value={reportForm.title}
          onChange={(event) => {
            setReportMessage(null);
            setReportForm((prev) => ({ ...prev, title: event.target.value }));
          }}
        />
        <TextArea
          label="내용"
          required
          placeholder="상황 보고 내용을 입력하세요."
          value={reportForm.content}
          onChange={(event) => {
            setReportMessage(null);
            setReportForm((prev) => ({ ...prev, content: event.target.value }));
          }}
        />
        <div className="report-reference-box">
          <span className="report-reference-box__title">보고 기준 위치</span>
          <CoordinateDisplay
            latitude={reportPosition.latitude}
            longitude={reportPosition.longitude}
          />
          <span>
            기준:{" "}
            {selectedTarget
              ? `선택 표적 ${selectedTarget.name}`
              : selectedDrone
                ? `선택 드론 ${selectedDrone.name}`
                : `작전지역 중심 ${enemyArea.name}`}
          </span>
        </div>
        <div className="ui-form-row">
          <SelectInput
            label="중요 여부"
            options={[
              { value: "false", label: "일반" },
              { value: "true", label: "중요" },
            ]}
            value={reportForm.important ? "true" : "false"}
            onChange={(event) =>
              setReportForm((prev) => ({
                ...prev,
                important: event.target.value === "true",
              }))
            }
          />
          <SelectInput
            label="연계 드론"
            placeholder="선택 안 함"
            value={reportForm.linkedDroneId}
            onChange={(event) =>
              setReportForm((prev) => ({
                ...prev,
                linkedDroneId: event.target.value,
              }))
            }
            options={drones.map((drone) => ({
              value: drone.id,
              label: drone.name,
            }))}
          />
        </div>
        {reportMessage ? (
          <p className="control-hint">{reportMessage}</p>
        ) : null}
      </FormModal>

      {areaCreateModalElement}

      {isDeparturePickerOpen ? (
        <MapPointPickerModal
          title="출발 좌표 선택"
          description="지도를 클릭해 드론 출발 좌표를 지정하세요."
          center={{ latitude: enemyArea.latitude, longitude: enemyArea.longitude }}
          initial={
            droneForm.departureLatitude.trim() !== "" &&
            droneForm.departureLongitude.trim() !== "" &&
            Number.isFinite(Number(droneForm.departureLatitude)) &&
            Number.isFinite(Number(droneForm.departureLongitude))
              ? {
                  latitude: Number(droneForm.departureLatitude),
                  longitude: Number(droneForm.departureLongitude),
                }
              : null
          }
          onConfirm={(coordinate) => {
            setDroneForm((prev) => ({
              ...prev,
              departureLatitude: coordinate.latitude.toFixed(6),
              departureLongitude: coordinate.longitude.toFixed(6),
            }));
            setDroneFormMessage(null);
            setIsDeparturePickerOpen(false);
          }}
          onClose={() => setIsDeparturePickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
