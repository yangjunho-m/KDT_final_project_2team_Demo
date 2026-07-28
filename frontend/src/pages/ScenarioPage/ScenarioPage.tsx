import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AppPanel,
  BrandLogo,
  EmptyState,
  PanelHeader,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "../../shared/components";
import {
  ScenarioNaverZoneMap,
  ScenarioReadinessPanel,
  ScenarioRunTypeIcon,
  ScenarioZoneMap,
  type ScenarioReadinessItem,
  type ScenarioZoneEditMode,
  type ScenarioZoneTone,
} from "../../features/scenario/components";
import { useNaverMapsSdk } from "../../features/operation-map/naver/naverMapsLoader";
import {
  createDefaultJammingConfig,
  createDefaultSpoofingConfig,
  createEmptyScenarioDraft,
  type InterferenceLevel,
  type JammingTargetSystem,
  type ScenarioDraftConfig,
  type ScenarioDraftState,
  type ScenarioRunType,
} from "../../features/scenario/domain";
import {
  buildCreateScenarioRunRequest,
  ZONE_DEFAULT_RADIUS_METERS,
  ZONE_MAX_RADIUS_METERS,
  ZONE_MIN_RADIUS_METERS,
  ZONE_RADIUS_STEP_METERS,
  clampRadiusMeters,
} from "../../features/scenario/utils";
import {
  useOperationAreasQuery,
  useOperationSnapshotQuery,
} from "../../features/operation/hooks";
import {
  useActiveScenarioRunsQuery,
  useCreateScenarioTemplateMutation,
  useRemoveScenarioTemplateMutation,
  useRunnableScenarioTemplatesQuery,
  useStopScenarioRunMutation,
} from "../../features/scenario/hooks";
import { useCurrentUserQuery } from "../../features/auth";
import {
  useCreateTargetMutation,
  useRemoveTargetMutation,
  useUploadTargetImageMutation,
} from "../../features/target/hooks";
import { PlacedTargetList } from "../../features/target/components";
import {
  RealtimeEventMonitor,
  useDroneRuntimeRealtimeSync,
  useRealtimeConnection,
  useRealtimeEventObserver,
  useScenarioRealtimeSync,
  useScenarioStoppedCleanup,
} from "../../features/realtime";
import { ApiError } from "../../api/apiClient";
import { subscribeEnemyAreaChange } from "../../shared/utils";
import type { Coordinate } from "../../shared/types";
import "../../shared/styles/layout.css";
import "../../features/scenario/components/scenario-components.css";
import "./scenario.css";

const runTypeLabels: Record<ScenarioRunType, string> = {
  JAMMING: "재밍",
  SPOOFING: "스푸핑",
};

const runTypeDescriptions: Record<ScenarioRunType, string> = {
  JAMMING: "정상 신호 수신을 방해하는 교란 시나리오",
  SPOOFING: "허위 위치 정보를 주입하는 기만 시나리오",
};

const levelLabels: Record<InterferenceLevel, string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
};

const noOperationAreaMessage =
  "등록된 작전지역이 없습니다. 작전지역을 먼저 등록한 뒤 모니터링을 시작해주세요.";

const jammingTargetLabels: Record<JammingTargetSystem, string> = {
  GNSS: "GNSS",
  COMMUNICATION: "통신 링크",
  BOTH: "복합",
};

const jammingTargetOptions: JammingTargetSystem[] = [
  "GNSS",
  "COMMUNICATION",
  "BOTH",
];
const levelOptions: InterferenceLevel[] = ["LOW", "MEDIUM", "HIGH"];

// 교란 구역 지도 유형별 보조 문구
const JAMMING_ZONE_CAPTION =
  "구역 진입 시 선택한 항법·통신 시스템의 신호가 방해됩니다.";
const SPOOFING_ZONE_CAPTION =
  "구역 진입 시 드론의 GNSS 보고 위치가 허위 좌표로 처리됩니다.";

function getScenarioApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

function isLockedScenarioStatus(status: string | undefined) {
  return status === "STARTING" || status === "RUNNING" || status === "STOPPING";
}

export function ScenarioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAreaId = searchParams.get("areaId");
  const operationAreasQuery = useOperationAreasQuery();
  const operationAreas = useMemo(
    () => operationAreasQuery.data ?? [],
    [operationAreasQuery.data],
  );
  const isOperationAreasLoaded = operationAreasQuery.data !== undefined;
  const hasOperationAreas = operationAreas.length > 0;
  const isRequestedAreaIdValid =
    requestedAreaId !== null &&
    operationAreas.some((area) => area.id === requestedAreaId);
  const areaId =
    requestedAreaId !== null
      ? isRequestedAreaIdValid
        ? requestedAreaId
        : null
      : operationAreas[0]?.id ?? null;
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
  const snapshotQuery = useOperationSnapshotQuery(areaId);
  const snapshot = snapshotQuery.data ?? {
    enemyArea: fallbackArea,
    drones: [],
    targets: [],
    activeScenarios: [],
  };
  const { enemyArea, drones, targets } = snapshot;
  const hasDrones = drones.length > 0;
  const activeRunsQuery = useActiveScenarioRunsQuery(areaId);
  const activeRun =
    activeRunsQuery.data?.find((run) => run.areaId === areaId) ?? null;
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
        // Drone runtime keyframes must not block other realtime consumers.
      }
    },
    onReconnect: realtimeObserver.recordReconnect,
  });
  const areaSelectionBlockedReason = operationAreasQuery.isLoading
    ? "작전지역 목록을 확인하는 중입니다."
    : operationAreasQuery.isError
      ? "작전지역 목록을 불러오지 못했습니다. 새로고침 후 다시 시도하세요."
      : isOperationAreasLoaded && !hasOperationAreas
        ? noOperationAreaMessage
        : isOperationAreasLoaded && areaId === null
          ? "선택한 작전지역이 존재하지 않습니다. 지휘화면에서 등록된 작전지역을 다시 선택해주세요."
          : null;
  const isScenarioLocked = isLockedScenarioStatus(activeRun?.status);
  // 네이버 지도 준비 시 실지도 기반 구역 편집, 아니면 기존 시뮬레이션 캔버스 fallback
  const isRealMapActive = useNaverMapsSdk() === "ready";
  const stopScenarioRunMutation = useStopScenarioRunMutation();
  const activeAreaIdRef = useRef<string | null>(areaId);

  // 시나리오 Draft (대상 드론 선택 없음 — 배정 드론 전체가 판정 대상)
  const [scenarioType, setScenarioType] = useState<ScenarioRunType | null>(null);
  const [config, setConfig] = useState<ScenarioDraftConfig | null>(null);
  const [zoneCenter, setZoneCenter] = useState<Coordinate | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(ZONE_DEFAULT_RADIUS_METERS);
  // 스푸핑 지도 편집 모드: 교란 구역 중심 / 허위 좌표
  const [editMode, setEditMode] = useState<ScenarioZoneEditMode>("ZONE");
  const [applyMessage, setApplyMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  // 시나리오 템플릿(백엔드 저장) — "저장된 설정"을 여러 작전지역/브라우저에서 재사용한다.
  const currentUserQuery = useCurrentUserQuery();
  const templatesQuery = useRunnableScenarioTemplatesQuery();
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateMessage, setTemplateMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const createTemplateMutation = useCreateScenarioTemplateMutation();
  const removeTemplateMutation = useRemoveScenarioTemplateMutation();
  const isInputLocked =
    areaSelectionBlockedReason !== null ||
    isScenarioLocked ||
    createTemplateMutation.isPending ||
    stopScenarioRunMutation.isPending;

  // 작전지역 전환 시 draft를 비운다. "저장된 설정 재사용"은 이제 로컬 저장소가 아니라
  // 백엔드 시나리오 템플릿(아래 템플릿 패널)을 통해서만 이루어진다.
  const resetDraft = useCallback((nextAreaId: string | null = areaId) => {
    const empty = createEmptyScenarioDraft(nextAreaId ?? undefined);
    setScenarioType(empty.scenarioType);
    setConfig(empty.config);
    setZoneCenter(null);
    setRadiusMeters(ZONE_DEFAULT_RADIUS_METERS);
    setEditMode("ZONE");
    setApplyMessage(null);
  }, [areaId]);

  useEffect(() => {
    activeAreaIdRef.current = areaId;
  }, [areaId]);

  useEffect(() => {
    realtimeObserver.recordConnectionState(realtimeConnectionState);
  }, [realtimeConnectionState, realtimeObserver]);

  useEffect(() => {
    return subscribeEnemyAreaChange("scenario-simulator", (nextAreaId) => {
      setSearchParams({ areaId: nextAreaId });
      resetDraft(nextAreaId);
    });
  }, [resetDraft, setSearchParams]);

  const handleAreaChange = (nextAreaId: string) => {
    setSearchParams({ areaId: nextAreaId });
    resetDraft(nextAreaId);
  };

  // 유형 전환: 이전 유형 설정값(허위 좌표 포함)은 폐기, 교란 구역은 유지
  const selectType = (type: ScenarioRunType) => {
    if (isInputLocked) {
      return;
    }
    setScenarioType(type);
    setConfig(
      type === "JAMMING"
        ? createDefaultJammingConfig()
        : createDefaultSpoofingConfig(),
    );
    setEditMode("ZONE");
    setApplyMessage(null);
  };

  const updateJammingTarget = (targetSystem: JammingTargetSystem) => {
    if (isInputLocked) {
      return;
    }
    setConfig((prev) =>
      prev && prev.type === "JAMMING" ? { ...prev, targetSystem } : prev,
    );
    setApplyMessage(null);
  };
  const updateJammingIntensity = (intensity: InterferenceLevel) => {
    if (isInputLocked) {
      return;
    }
    setConfig((prev) =>
      prev && prev.type === "JAMMING" ? { ...prev, intensity } : prev,
    );
    setApplyMessage(null);
  };
  const updateSpoofingSeverity = (severity: InterferenceLevel) => {
    if (isInputLocked) {
      return;
    }
    setConfig((prev) =>
      prev && prev.type === "SPOOFING" ? { ...prev, severity } : prev,
    );
    setApplyMessage(null);
  };
  const setSpoofedPosition = (spoofedPosition: Coordinate) => {
    if (isInputLocked) {
      return;
    }
    setConfig((prev) =>
      prev && prev.type === "SPOOFING" ? { ...prev, spoofedPosition } : prev,
    );
    setApplyMessage(null);
  };
  const resetSpoofedPosition = () => {
    if (isInputLocked) {
      return;
    }
    setConfig((prev) =>
      prev && prev.type === "SPOOFING"
        ? { ...prev, spoofedPosition: null }
        : prev,
    );
    setApplyMessage(null);
  };

  const handleRadiusChange = (next: number) => {
    if (isInputLocked) {
      return;
    }
    setRadiusMeters(clampRadiusMeters(next));
    setApplyMessage(null);
  };
  const handleResetZone = () => {
    if (isInputLocked) {
      return;
    }
    setZoneCenter(null);
    setRadiusMeters(ZONE_DEFAULT_RADIUS_METERS);
    setApplyMessage(null);
  };

  // 표적 배치/제거 (시뮬 대상 — 관제 화면에서 드론이 근접해야 발견된다)
  const createTargetMutation = useCreateTargetMutation();
  const removeTargetMutation = useRemoveTargetMutation();
  const [targetMessage, setTargetMessage] = useState<string | null>(null);

  const handleTargetPlace = (coord: Coordinate) => {
    if (!areaId || createTargetMutation.isPending) {
      return;
    }
    createTargetMutation.mutate(
      {
        areaId,
        type: `표적-${targets.length + 1}`,
        position: coord,
      },
      {
        onSuccess: (target) => {
          setTargetMessage(
            `'${target.name}' 배치 완료 — 관제 화면에서 드론이 근접하면 발견됩니다.`,
          );
        },
        onError: (error) => {
          setTargetMessage(
            getScenarioApiErrorMessage(error, "표적 배치가 실패했습니다."),
          );
        },
      },
    );
  };

  const uploadTargetImageMutation = useUploadTargetImageMutation();

  const handleTargetImageUpload = (targetId: string, file: File) => {
    if (!areaId) {
      return;
    }
    uploadTargetImageMutation.mutate(
      { targetId, file, areaId },
      {
        onSuccess: () =>
          setTargetMessage("표적 이미지가 첨부되었습니다. 발견 시 함께 표시됩니다."),
        onError: (error) =>
          setTargetMessage(
            getScenarioApiErrorMessage(error, "표적 이미지 업로드가 실패했습니다."),
          ),
      },
    );
  };

  const handleTargetRemove = (targetId: string) => {
    if (!areaId || removeTargetMutation.isPending) {
      return;
    }
    removeTargetMutation.mutate(
      { targetId, areaId },
      {
        onSuccess: () => setTargetMessage("표적이 제거되었습니다."),
        onError: (error) =>
          setTargetMessage(
            getScenarioApiErrorMessage(error, "표적 제거가 실패했습니다."),
          ),
      },
    );
  };

  // 지도 클릭: 편집 모드에 따라 구역 중심 / 허위 좌표 / 표적 배치로 라우팅
  const handleMapPoint = (coord: Coordinate) => {
    if (isInputLocked) {
      return;
    }
    if (editMode === "TARGET") {
      handleTargetPlace(coord);
      return;
    }
    if (scenarioType === "SPOOFING" && editMode === "SPOOF") {
      setSpoofedPosition(coord);
      return;
    }
    const isFirstCenter = zoneCenter === null;
    setZoneCenter(coord);
    setApplyMessage(null);
    // 스푸핑에서 구역 중심을 처음 지정하면 허위 좌표 모드로 자동 전환
    if (scenarioType === "SPOOFING" && isFirstCenter) {
      setEditMode("SPOOF");
    }
  };

  // 파생 Draft / 검증 (droneIds는 요청에 포함하지 않음)
  const draft: ScenarioDraftState = {
    areaId,
    scenarioType,
    config,
    interferenceZone: zoneCenter ? { center: zoneCenter, radiusMeters } : null,
  };
  // 이 draft를 "저장"할 수 있는지(=시나리오 실행 요청 형태로 만들 수 있는지)만
  // 확인한다 — 배정 드론 존재 여부는 저장이 아니라 "실행"(모니터링 화면) 조건이므로
  // 여기서는 더 이상 가리지 않는다.
  const isDraftComplete = buildCreateScenarioRunRequest(draft) !== null;
  const displayScenarioType = activeRun?.scenarioType ?? scenarioType;
  const displayConfig = activeRun?.config ?? config;
  const displayZoneCenter = activeRun?.interferenceZone.center ?? zoneCenter;
  const displayRadiusMeters =
    activeRun?.interferenceZone.radiusMeters ?? radiusMeters;
  const displayEditMode =
    activeRun?.scenarioType === "SPOOFING" ? "SPOOF" : editMode;
  const selectedAreaLabel = areaId ? enemyArea.name : "선택된 작전지역 없음";

  const spoofedPosition =
    displayConfig?.type === "SPOOFING" ? displayConfig.spoofedPosition : null;
  const radiusValid =
    displayRadiusMeters >= ZONE_MIN_RADIUS_METERS &&
    displayRadiusMeters <= ZONE_MAX_RADIUS_METERS;

  const tone: ScenarioZoneTone =
    displayScenarioType === "JAMMING"
      ? "jamming"
      : displayScenarioType === "SPOOFING"
        ? "spoofing"
        : "neutral";
  const zoneLabel =
    displayConfig?.type === "JAMMING"
      ? "재밍 구역"
      : displayConfig?.type === "SPOOFING"
        ? "스푸핑 구역"
        : "교란 구역";
  const zoneCaption =
    displayConfig?.type === "JAMMING"
      ? JAMMING_ZONE_CAPTION
      : displayConfig?.type === "SPOOFING"
        ? SPOOFING_ZONE_CAPTION
        : null;

  const readinessItems: ScenarioReadinessItem[] =
    displayConfig?.type === "SPOOFING"
      ? [
          { label: "작전지역 선택", done: Boolean(areaId) },
          { label: "스푸핑 선택", done: true },
          { label: "기만 수준 설정", done: true },
          { label: "스푸핑 구역 중심 설정", done: displayZoneCenter !== null },
          { label: "허위 좌표 설정", done: spoofedPosition !== null },
          { label: "유효한 반경 (50–5000m)", done: radiusValid },
        ]
      : [
          { label: "작전지역 선택", done: Boolean(areaId) },
          { label: "재밍 선택", done: displayScenarioType === "JAMMING" },
          { label: "재밍 설정 완료", done: displayConfig?.type === "JAMMING" },
          { label: "교란 구역 중심 설정", done: displayZoneCenter !== null },
          { label: "유효한 반경 (50–5000m)", done: radiusValid },
        ];

  const canSaveTemplate =
    templateName.trim().length > 0 &&
    isDraftComplete &&
    !createTemplateMutation.isPending;

  const handleSaveTemplate = () => {
    const request = buildCreateScenarioRunRequest(draft);
    if (!request || templateName.trim().length === 0) {
      setTemplateMessage({
        tone: "error",
        text: "템플릿으로 저장하려면 이름과 시나리오 유형·설정·교란 구역을 먼저 지정하세요.",
      });
      return;
    }
    setTemplateMessage(null);
    createTemplateMutation.mutate(
      {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        scenarioType: request.scenarioType,
        config: request.config,
        interferenceZone: request.interferenceZone,
        createdBy: currentUserQuery.data?.username ?? null,
      },
      {
        onSuccess: (template) => {
          setTemplateName("");
          setTemplateDescription("");
          setSelectedTemplateId(template.id);
          setTemplateMessage({
            tone: "success",
            text: `'${template.name}' 템플릿으로 저장되었습니다.`,
          });
        },
        onError: (error) => {
          setTemplateMessage({
            tone: "error",
            text: getScenarioApiErrorMessage(error, "템플릿 저장이 실패했습니다."),
          });
        },
      },
    );
  };

  const handleLoadTemplate = () => {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template || isInputLocked) {
      return;
    }
    setScenarioType(template.scenarioType);
    setConfig(template.config);
    setZoneCenter(template.interferenceZone.center);
    setRadiusMeters(template.interferenceZone.radiusMeters);
    setEditMode(template.scenarioType === "SPOOFING" ? "SPOOF" : "ZONE");
    setApplyMessage(null);
    setTemplateMessage({
      tone: "success",
      text: `'${template.name}' 템플릿을 불러왔습니다.`,
    });
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId || removeTemplateMutation.isPending) {
      return;
    }
    const template = templates.find((item) => item.id === selectedTemplateId);
    removeTemplateMutation.mutate(selectedTemplateId, {
      onSuccess: () => {
        setSelectedTemplateId("");
        setTemplateMessage({
          tone: "success",
          text: template ? `'${template.name}' 템플릿이 삭제되었습니다.` : "템플릿이 삭제되었습니다.",
        });
      },
      onError: (error) => {
        setTemplateMessage({
          tone: "error",
          text: getScenarioApiErrorMessage(error, "템플릿 삭제가 실패했습니다."),
        });
      },
    });
  };

  const handleScenarioStop = () => {
    if (!activeRun || stopScenarioRunMutation.isPending) {
      return;
    }
    const input = { runId: activeRun.id, areaId: activeRun.areaId };
    setApplyMessage(null);
    stopScenarioRunMutation.mutate(input, {
      onSuccess: (run, request) => {
        if (activeAreaIdRef.current !== request.areaId) {
          return;
        }
        setApplyMessage({
          tone: "success",
          text: `${run.id} 중지 요청이 전송되었습니다.`,
        });
      },
      onError: (error, request) => {
        if (activeAreaIdRef.current !== request.areaId) {
          return;
        }
        setApplyMessage({
          tone: "error",
          text: getScenarioApiErrorMessage(
            error,
            "시나리오 중지 요청이 실패했습니다.",
          ),
        });
      },
    });
  };

  return (
    <div className="page scenario-page-root">
      <header className="app-header">
        <div className="app-header__brand">
          <BrandLogo size={40} />
          <div className="app-header__brand-text">
            <span className="app-header__title">드론 시나리오 시뮬레이터</span>
            <span className="app-header__eyebrow">Drone Scenario Simulator</span>
          </div>
        </div>
        <div className="app-header__status">
          <span className="app-header__status-item">
            <span className="app-header__status-label">작전지역</span>
            <span className="app-header__status-value">{selectedAreaLabel}</span>
          </span>
          <span className="app-header__status-divider" />
          <span className="app-header__status-item">
            <span className="app-header__status-label">배정 드론</span>
            <span className="app-header__status-value">{drones.length}대</span>
          </span>
          <span className="app-header__status-divider" />
          <StatusBadge tone={activeRun ? "primary" : "secondary"}>
            {activeRun ? activeRun.status : "대기"}
          </StatusBadge>
        </div>
        <div className="app-header__actions">
          <SelectInput
            className="app-header__area-select"
            aria-label="작전지역 선택"
            options={operationAreaOptions}
            value={areaId ?? ""}
            onChange={(event) => handleAreaChange(event.target.value)}
            disabled={operationAreaOptions.length === 0}
          />
        </div>
      </header>

      <div className="page-body scenario-body">
        <div className="scenario-grid">
          {/* 좌측: 작전지역 선택 / 배정 드론 현황 */}
          <div className="scenario-col scenario-col--left">
            <AppPanel
              header={<PanelHeader title="1. 작전지역 선택" subtitle="시나리오 대상" />}
            >
              <div className="kv-row">
                <span className="kv-row__label">선택 작전지역</span>
                <span className="kv-row__value">{selectedAreaLabel}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">배정 드론</span>
                <StatusBadge tone={hasDrones ? "primary" : "neutral"}>
                  {drones.length}대
                </StatusBadge>
              </div>
              {areaSelectionBlockedReason ? (
                <p className="scenario-apply__reason">
                  <span aria-hidden="true">ⓘ</span> {areaSelectionBlockedReason}
                </p>
              ) : null}
            </AppPanel>

            <AppPanel
              className="scenario-drone-panel"
              header={
                <PanelHeader
                  title="2. 배정 드론 현황"
                  subtitle="읽기 전용"
                  actions={
                    <StatusBadge tone={hasDrones ? "primary" : "neutral"}>
                      {drones.length}대
                    </StatusBadge>
                  }
                />
              }
              bodyClassName="scroll-body"
            >
              {hasDrones ? (
                <>
                  <ul className="scenario-drone-list">
                    {drones.map((drone) => (
                      <li key={drone.id} className="scenario-drone-row">
                        <span className="scenario-drone-row__dot" aria-hidden="true" />
                        <span className="scenario-drone-row__name">
                          {drone.name}
                        </span>
                        <span className="scenario-drone-row__tag">배정</span>
                      </li>
                    ))}
                  </ul>
                  <p className="scenario-note">
                    배정된 모든 드론이 교란 구역 진입 판정 대상입니다.
                  </p>
                </>
              ) : (
                <EmptyState
                  icon="🛩"
                  title="배정 드론 0대"
                  description="현재 작전지역에 배정된 드론이 없습니다."
                />
              )}
            </AppPanel>
          </div>

          {/* 중앙: 템플릿 / 유형 / 설정 / 교란 구역 지도 */}
          <div className="scenario-col scenario-col--center">
            <AppPanel
              className="scenario-template-panel"
              header={
                <PanelHeader
                  title="시나리오 템플릿"
                  subtitle="저장된 설정 불러오기 · 삭제 (저장은 우측 '6. 설정 요약'에서)"
                />
              }
            >
              <div className="scenario-template-row">
                <SelectInput
                  aria-label="템플릿 선택"
                  placeholder={
                    templatesQuery.isLoading
                      ? "불러오는 중..."
                      : templates.length === 0
                        ? "저장된 템플릿 없음"
                        : "템플릿 선택"
                  }
                  value={selectedTemplateId}
                  disabled={templates.length === 0 || isInputLocked}
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    setTemplateMessage(null);
                  }}
                  options={templates.map((template) => ({
                    value: template.id,
                    label: `${template.name} · ${runTypeLabels[template.scenarioType]}`,
                  }))}
                />
                <SecondaryButton
                  size="sm"
                  disabled={!selectedTemplateId || isInputLocked}
                  onClick={handleLoadTemplate}
                >
                  불러오기
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  disabled={!selectedTemplateId || removeTemplateMutation.isPending}
                  onClick={handleDeleteTemplate}
                >
                  {removeTemplateMutation.isPending ? "삭제 중..." : "삭제"}
                </SecondaryButton>
              </div>
              {templatesQuery.isError ? (
                <p className="scenario-apply__reason">
                  <span aria-hidden="true">ⓘ</span> 템플릿 목록을 불러오지 못했습니다.
                </p>
              ) : null}
              {templateMessage ? (
                <p
                  className={`scenario-apply__message scenario-apply__message--${templateMessage.tone}`}
                >
                  {templateMessage.text}
                </p>
              ) : null}
            </AppPanel>

            <AppPanel
              className="scenario-type-panel"
              header={
                <PanelHeader title="3. 시나리오 유형" subtitle="재밍 또는 스푸핑" />
              }
            >
              <div className="scenario-type-cards">
                {(["JAMMING", "SPOOFING"] as ScenarioRunType[]).map((type) => {
                  const isSelected = displayScenarioType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`scenario-type-card scenario-type-card--${type.toLowerCase()}${
                        isSelected ? " is-selected" : ""
                      }`}
                      aria-pressed={isSelected}
                      disabled={isInputLocked}
                      onClick={() => selectType(type)}
                    >
                      <span className="scenario-type-card__icon" aria-hidden="true">
                        <ScenarioRunTypeIcon type={type} />
                      </span>
                      <span className="scenario-type-card__body">
                        <span className="scenario-type-card__name">
                          {runTypeLabels[type]}
                        </span>
                        <span className="scenario-type-card__desc">
                          {runTypeDescriptions[type]}
                        </span>
                      </span>
                      <span
                        className="scenario-type-card__check"
                        aria-hidden="true"
                      >
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </AppPanel>

            {displayConfig?.type === "JAMMING" ? (
              <AppPanel
                className="scenario-config-panel scenario-config-panel--jamming"
                header={<PanelHeader title="4. 재밍 설정" subtitle="교란 대상과 강도" />}
              >
                <div className="scenario-config-row">
                  <div className="scenario-field">
                    <span className="scenario-field__label">교란 대상</span>
                    <div className="scenario-segment scenario-segment--jamming" role="group">
                      {jammingTargetOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`scenario-segment__btn${
                            displayConfig.targetSystem === option ? " is-active" : ""
                          }`}
                          disabled={isInputLocked}
                          onClick={() => updateJammingTarget(option)}
                        >
                          {jammingTargetLabels[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="scenario-field">
                    <span className="scenario-field__label">재밍 강도</span>
                    <div className="scenario-segment scenario-segment--jamming" role="group">
                      {levelOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`scenario-segment__btn${
                            displayConfig.intensity === option ? " is-active" : ""
                          }`}
                          disabled={isInputLocked}
                          onClick={() => updateJammingIntensity(option)}
                        >
                          {levelLabels[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </AppPanel>
            ) : null}

            {displayConfig?.type === "SPOOFING" ? (
              <AppPanel
                className="scenario-config-panel scenario-config-panel--spoofing"
                header={<PanelHeader title="4. 스푸핑 설정" subtitle="기만 수준과 허위 좌표" />}
              >
                <div className="scenario-config-row">
                  <div className="scenario-field">
                    <span className="scenario-field__label">기만 수준</span>
                    <div className="scenario-segment scenario-segment--spoofing" role="group">
                      {levelOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`scenario-segment__btn${
                            displayConfig.severity === option ? " is-active" : ""
                          }`}
                          disabled={isInputLocked}
                          onClick={() => updateSpoofingSeverity(option)}
                        >
                          {levelLabels[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="scenario-field">
                    <span className="scenario-field__label">허위 좌표</span>
                    <div className="scenario-spoofpos">
                      {displayConfig.spoofedPosition ? (
                        <>
                          <span className="scenario-spoofpos__value">
                            {displayConfig.spoofedPosition.latitude.toFixed(5)},{" "}
                            {displayConfig.spoofedPosition.longitude.toFixed(5)}
                          </span>
                          <button
                            type="button"
                            className="scenario-spoofpos__reset"
                            disabled={isInputLocked}
                            onClick={resetSpoofedPosition}
                          >
                            초기화
                          </button>
                        </>
                      ) : (
                        <span className="scenario-spoofpos__empty">
                          지도의 &quot;허위 좌표 지정&quot; 모드에서 지정하세요.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="scenario-mode-desc">
                  교란 구역에 진입한 드론의 GNSS 보고 위치가 설정한 허위 좌표로 처리됩니다.
                  <br />
                  <span className="scenario-mode-desc__sub">
                    실제 위치와 허위 보고 위치는 모니터링 화면에서 비교합니다.
                  </span>
                </p>
              </AppPanel>
            ) : null}

            <AppPanel
              className="scenario-zone-panel"
              header={
                <PanelHeader
                  title="5. 교란 구역 설정"
                  subtitle="배정 드론 공통 적용"
                  actions={
                    <div className="scenario-radius">
                      <span className="scenario-radius__label">반경</span>
                      <button
                        type="button"
                        className="scenario-radius__btn"
                        aria-label="반경 감소"
                        onClick={() =>
                          handleRadiusChange(radiusMeters - ZONE_RADIUS_STEP_METERS)
                        }
                        disabled={
                          isInputLocked ||
                          displayRadiusMeters <= ZONE_MIN_RADIUS_METERS
                        }
                      >
                        −
                      </button>
                      <input
                        className="scenario-radius__input"
                        type="number"
                        min={ZONE_MIN_RADIUS_METERS}
                        max={ZONE_MAX_RADIUS_METERS}
                        step={ZONE_RADIUS_STEP_METERS}
                        value={displayRadiusMeters}
                        disabled={isInputLocked}
                        onChange={(event) =>
                          handleRadiusChange(Number(event.target.value))
                        }
                        aria-label="교란 반경 (m)"
                      />
                      <span className="scenario-radius__unit">m</span>
                      <button
                        type="button"
                        className="scenario-radius__btn"
                        aria-label="반경 증가"
                        onClick={() =>
                          handleRadiusChange(radiusMeters + ZONE_RADIUS_STEP_METERS)
                        }
                        disabled={
                          isInputLocked ||
                          displayRadiusMeters >= ZONE_MAX_RADIUS_METERS
                        }
                      >
                        +
                      </button>
                    </div>
                  }
                />
              }
              flushBody
            >
              {areaId ? (
                (() => {
                  const ZoneMapComponent = isRealMapActive
                    ? ScenarioNaverZoneMap
                    : ScenarioZoneMap;
                  return (
                    <ZoneMapComponent
                      area={enemyArea}
                      drones={drones}
                      targets={targets}
                      zone={
                        displayZoneCenter
                          ? {
                              center: displayZoneCenter,
                              radiusMeters: displayRadiusMeters,
                            }
                          : null
                      }
                      tone={tone}
                      zoneLabel={zoneLabel}
                      zoneCaption={zoneCaption}
                      editMode={displayEditMode}
                      allowSpoofMode={displayScenarioType === "SPOOFING"}
                      spoofedPosition={spoofedPosition}
                      disabled={isInputLocked}
                      onEditModeChange={setEditMode}
                      onPointSet={handleMapPoint}
                      onTargetRemove={handleTargetRemove}
                      onReset={handleResetZone}
                    />
                  );
                })()
              ) : (
                <EmptyState
                  title="등록된 작전지역이 없습니다."
                  description={areaSelectionBlockedReason ?? noOperationAreaMessage}
                />
              )}
              {targetMessage ? (
                <p className="scenario-apply__reason scenario-target-message">
                  <span aria-hidden="true">◎</span> {targetMessage}
                </p>
              ) : null}
              <PlacedTargetList
                targets={targets}
                disabled={isInputLocked}
                uploadingTargetId={
                  uploadTargetImageMutation.isPending
                    ? uploadTargetImageMutation.variables?.targetId ?? null
                    : null
                }
                onUploadImage={handleTargetImageUpload}
                onRemove={handleTargetRemove}
              />
            </AppPanel>
          </div>

          {/* 우측: 요약 / 저장 준비 / 저장 */}
          <div className="scenario-col scenario-col--right">
            <AppPanel
              header={<PanelHeader title="6. 설정 요약" subtitle="저장 전 확인" />}
            >
              <div className="scenario-summary">
                <div className="kv-row">
                  <span className="kv-row__label">작전지역</span>
                  <span className="kv-row__value">{selectedAreaLabel}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-row__label">배정 드론</span>
                  <span className="kv-row__value">{drones.length}대</span>
                </div>
                {activeRun ? (
                  <>
                    <div className="kv-row">
                      <span className="kv-row__label">실행 ID</span>
                      <span className="kv-row__value">{activeRun.id}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-row__label">실행 상태</span>
                      <span className="kv-row__value">{activeRun.status}</span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-row__label">참여 드론</span>
                      <span className="kv-row__value">
                        {activeRun.participatingDrones.length}대
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="kv-row">
                  <span className="kv-row__label">시나리오 유형</span>
                  <span
                    className={`kv-row__value${
                      displayScenarioType ? ` scenario-summary__type--${tone}` : ""
                    }`}
                  >
                    {displayScenarioType
                      ? runTypeLabels[displayScenarioType]
                      : "미설정"}
                  </span>
                </div>
                {displayConfig?.type === "JAMMING" ? (
                  <>
                    <div className="kv-row">
                      <span className="kv-row__label">교란 대상</span>
                      <span className="kv-row__value">
                        {jammingTargetLabels[displayConfig.targetSystem]}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span className="kv-row__label">재밍 강도</span>
                      <span className="kv-row__value">
                        {levelLabels[displayConfig.intensity]}
                      </span>
                    </div>
                  </>
                ) : null}
                {displayConfig?.type === "SPOOFING" ? (
                  <div className="kv-row">
                    <span className="kv-row__label">기만 수준</span>
                    <span className="kv-row__value">
                      {levelLabels[displayConfig.severity]}
                    </span>
                  </div>
                ) : null}
                <div className="kv-row">
                  <span className="kv-row__label">교란 구역 반경</span>
                  <span className="kv-row__value">
                    {displayZoneCenter ? `${displayRadiusMeters} m` : "미설정"}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-row__label">구역 중심 좌표</span>
                  <span className="kv-row__value">
                    {displayZoneCenter
                      ? `${displayZoneCenter.latitude.toFixed(5)}, ${displayZoneCenter.longitude.toFixed(5)}`
                      : "미설정"}
                  </span>
                </div>
                {displayConfig?.type === "SPOOFING" ? (
                  <div className="kv-row">
                    <span className="kv-row__label">허위 좌표</span>
                    <span className="kv-row__value">
                      {displayConfig.spoofedPosition
                        ? `${displayConfig.spoofedPosition.latitude.toFixed(5)}, ${displayConfig.spoofedPosition.longitude.toFixed(5)}`
                        : "미설정"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="scenario-apply">
                {activeRun ? (
                  <PrimaryButton
                    block
                    disabled={
                      activeRun.status === "STOPPING" ||
                      stopScenarioRunMutation.isPending
                    }
                    onClick={handleScenarioStop}
                  >
                    {activeRun.status === "STOPPING"
                      ? "종료 처리 중..."
                      : stopScenarioRunMutation.isPending
                        ? "중지 요청 중..."
                        : "시나리오 중지"}
                  </PrimaryButton>
                ) : (
                  <>
                    <TextInput
                      label="템플릿 이름"
                      placeholder="예: GNSS 재밍 시연 템플릿"
                      value={templateName}
                      disabled={isInputLocked}
                      onChange={(event) => {
                        setTemplateName(event.target.value);
                        setTemplateMessage(null);
                      }}
                    />
                    <TextInput
                      label="설명 (선택)"
                      placeholder="예: 발표용 재밍 시나리오 설정"
                      value={templateDescription}
                      disabled={isInputLocked}
                      onChange={(event) => setTemplateDescription(event.target.value)}
                    />
                    <PrimaryButton
                      block
                      disabled={!canSaveTemplate}
                      onClick={handleSaveTemplate}
                    >
                      {createTemplateMutation.isPending
                        ? "저장 중..."
                        : "시나리오 저장"}
                    </PrimaryButton>
                    <p className="scenario-apply__reason">
                      <span aria-hidden="true">ⓘ</span> 여기서는 저장만 합니다.
                      실행은 모니터링 화면에서 저장된 시나리오를 선택해 실행하세요.
                    </p>
                  </>
                )}
                {!activeRun && areaSelectionBlockedReason ? (
                  <p className="scenario-apply__reason">
                    <span aria-hidden="true">ⓘ</span> {areaSelectionBlockedReason}
                  </p>
                ) : null}
                {activeRun?.status === "STOPPING" ? (
                  <p className="scenario-apply__reason">
                    <span aria-hidden="true">ⓘ</span> 중지 요청이 접수되었습니다.
                    서버의 후속 처리 완료를 기다리고 있습니다.
                  </p>
                ) : null}
                {activeRunsQuery.error ? (
                  <p className="scenario-apply__message scenario-apply__message--error">
                    {getScenarioApiErrorMessage(
                      activeRunsQuery.error,
                      "활성 시나리오 상태를 불러오지 못했습니다.",
                    )}
                  </p>
                ) : null}
                {applyMessage ? (
                  <p
                    className={`scenario-apply__message scenario-apply__message--${applyMessage.tone}`}
                  >
                    {applyMessage.text}
                  </p>
                ) : null}
                {!activeRun && templateMessage ? (
                  <p
                    className={`scenario-apply__message scenario-apply__message--${templateMessage.tone}`}
                  >
                    {templateMessage.text}
                  </p>
                ) : null}
              </div>
            </AppPanel>

            <ScenarioReadinessPanel
              className="scenario-readiness-panel"
              items={readinessItems}
              allReady={isDraftComplete}
            />
          </div>
          {/* 실시간 이벤트 관찰(디버그 도구): ?debug=1 일 때만 표시 */}
          {import.meta.env.DEV && searchParams.get("debug") === "1" ? (
            <RealtimeEventMonitor />
          ) : null}
        </div>
      </div>
    </div>
  );
}
