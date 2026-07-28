import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  AppPanel,
  BrandLogo,
  ConfirmModal,
  FormModal,
  NumberInput,
  PanelHeader,
  StatusBadge,
  TextInput,
} from "../../shared/components";
import { AreaList } from "../../features/enemy-area/components";
import {
  useAllDronesQuery,
  useOperationAreasQuery,
  useRemoveEnemyAreaMutation,
  useUpdateEnemyAreaMutation,
} from "../../features/operation/hooks";
import {
  ReportDetailModal,
  ReportList,
} from "../../features/report/components";
import { formatReportDateTime } from "../../features/report/components/reportFormat";
import { useReportsQuery } from "../../features/report/hooks";
import { ApiError } from "../../api/apiClient";
import type { Drone, EnemyArea } from "../../shared/types";
import { postEnemyAreaChange } from "../../shared/utils";
import { useKstClock } from "../../shared/hooks";
import "../../shared/styles/layout.css";
import "./command-report.css";

type ReportFilter = "all" | "important" | "normal";

const reportFilterOptions: { value: ReportFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "important", label: "중요" },
  { value: "normal", label: "일반" },
];

// 일관된 선형(stroke) 아이콘 — 외부 라이브러리 없이 인라인 SVG로 통일한다.
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

function ReportGlyph() {
  return (
    <svg {...svgProps}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5h6v2.5H9zM8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </svg>
  );
}

function MonitorGlyph() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function ScenarioGlyph() {
  return (
    <svg {...svgProps}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M10 9.5l4.5 2.5L10 14.5z" />
    </svg>
  );
}

const navItems = [
  { to: "/reports", label: "지휘보고", icon: <ReportGlyph /> },
  { to: "/operation", label: "통합 모니터링", icon: <MonitorGlyph /> },
  { to: "/scenario", label: "시나리오 시뮬레이터", icon: <ScenarioGlyph /> },
];

const noOperationAreaMessage =
  "등록된 작전지역이 없습니다. 작전지역을 먼저 등록한 뒤 모니터링을 시작해주세요.";

// 독립 창은 종류별로 하나만 재사용한다. (9-4 참고)
function openMonitorWindow(areaId: string) {
  window.open(`/operation?areaId=${areaId}`, "operation-monitor");
  window.setTimeout(() => postEnemyAreaChange("operation-monitor", areaId), 50);
}

function openScenarioWindow(areaId: string) {
  window.open(`/scenario?areaId=${areaId}`, "scenario-simulator");
  window.setTimeout(() => postEnemyAreaChange("scenario-simulator", areaId), 50);
}

// 작전지역 삭제는 종속 데이터가 있으면 백엔드가 409 + error.code로 차단한다.
const AREA_DELETE_BLOCK_MESSAGES: Record<string, string> = {
  OPERATION_AREA_HAS_ACTIVE_SCENARIO_RUNS:
    "실행 중인 시나리오가 있어 삭제할 수 없습니다. 시나리오를 중지한 뒤 다시 시도하세요.",
  OPERATION_AREA_HAS_SCENARIO_RUN_HISTORY:
    "시나리오 실행 이력이 남아 있어 삭제할 수 없습니다.",
  OPERATION_AREA_HAS_ASSIGNED_DRONES:
    "배정된 드론이 있어 삭제할 수 없습니다. 드론 배정을 해제한 뒤 다시 시도하세요.",
  OPERATION_AREA_HAS_TARGETS: "등록된 표적이 있어 삭제할 수 없습니다.",
  OPERATION_AREA_HAS_REPORTS: "작성된 보고가 있어 삭제할 수 없습니다.",
};

function getAreaMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (AREA_DELETE_BLOCK_MESSAGES[error.code]) {
      return AREA_DELETE_BLOCK_MESSAGES[error.code];
    }
    // 서버 5xx는 원문(Internal Server Error 등) 대신 안내문으로 표시
    if (error.status >= 500 || error.isNetworkError) {
      return fallback;
    }
    return error.message;
  }
  return fallback;
}

type AreaEditFormState = {
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

export function CommandReportPage() {
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportToView, setReportToView] = useState<string | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<EnemyArea | null>(null);
  const [areaToEdit, setAreaToEdit] = useState<EnemyArea | null>(null);
  const [areaEditForm, setAreaEditForm] = useState<AreaEditFormState | null>(
    null,
  );
  const [areaActionMessage, setAreaActionMessage] = useState<string | null>(
    null,
  );
  const [monitorGuardMessage, setMonitorGuardMessage] = useState<string | null>(
    null,
  );

  const clock = useKstClock();
  const operationAreasQuery = useOperationAreasQuery();
  const operationAreas = useMemo(
    () => operationAreasQuery.data ?? [],
    [operationAreasQuery.data],
  );
  const hasOperationAreas = operationAreas.length > 0;

  const reportsQuery = useReportsQuery();
  const reports = useMemo(
    () => reportsQuery.data ?? [],
    [reportsQuery.data],
  );
  const dronesQuery = useAllDronesQuery();
  const allDrones = useMemo(
    () => dronesQuery.data ?? [],
    [dronesQuery.data],
  );

  const updateAreaMutation = useUpdateEnemyAreaMutation();
  const removeAreaMutation = useRemoveEnemyAreaMutation();

  const dronesById = useMemo(
    () =>
      allDrones.reduce<Record<string, Drone>>((acc, drone) => {
        acc[drone.id] = drone;
        return acc;
      }, {}),
    [allDrones],
  );

  const droneCountByArea = useMemo(() => {
    return allDrones.reduce<Record<string, number>>((acc, drone) => {
      if (drone.areaId) {
        acc[drone.areaId] = (acc[drone.areaId] ?? 0) + 1;
      }
      return acc;
    }, {});
  }, [allDrones]);

  const importantCount = useMemo(
    () => reports.filter((report) => report.important).length,
    [reports],
  );
  const normalCount = reports.length - importantCount;

  const activeDroneCount = useMemo(
    () =>
      allDrones.filter(
        (drone) => drone.status === "moving" || drone.status === "ready",
      ).length,
    [allDrones],
  );

  const sortedReports = useMemo(
    () =>
      [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reports],
  );

  const filteredReports = useMemo(() => {
    if (filter === "important") {
      return sortedReports.filter((report) => report.important);
    }
    if (filter === "normal") {
      return sortedReports.filter((report) => !report.important);
    }
    return sortedReports;
  }, [filter, sortedReports]);

  const recentReports = useMemo(
    () => sortedReports.slice(0, 6),
    [sortedReports],
  );

  const tabCounts: Record<ReportFilter, number> = {
    all: reports.length,
    important: importantCount,
    normal: normalCount,
  };

  const reportToViewData =
    reports.find((report) => report.id === reportToView) ?? null;

  const guardMonitorOpen = (areaId?: string) => {
    if (!hasOperationAreas) {
      setMonitorGuardMessage(noOperationAreaMessage);
      return;
    }
    if (!areaId || !operationAreas.some((area) => area.id === areaId)) {
      setMonitorGuardMessage(noOperationAreaMessage);
      return;
    }
    setMonitorGuardMessage(null);
    openMonitorWindow(areaId);
  };

  const handleAreaEditOpen = (areaId: string) => {
    const area = operationAreas.find((item) => item.id === areaId) ?? null;
    setAreaToEdit(area);
    setAreaEditForm(
      area
        ? {
            name: area.name,
            latitude: String(area.latitude),
            longitude: String(area.longitude),
            radiusMeters: String(area.radiusMeters),
          }
        : null,
    );
  };

  const handleAreaEditClose = () => {
    if (updateAreaMutation.isPending) {
      return;
    }
    setAreaToEdit(null);
    setAreaEditForm(null);
  };

  const isAreaEditFormValid =
    areaEditForm !== null &&
    areaEditForm.name.trim().length > 0 &&
    Number.isFinite(Number(areaEditForm.latitude)) &&
    Math.abs(Number(areaEditForm.latitude)) <= 90 &&
    Number.isFinite(Number(areaEditForm.longitude)) &&
    Math.abs(Number(areaEditForm.longitude)) <= 180 &&
    Number(areaEditForm.radiusMeters) > 0;

  const handleAreaEditSubmit = () => {
    if (!areaToEdit || !areaEditForm || !isAreaEditFormValid) {
      return;
    }
    setAreaActionMessage(null);
    updateAreaMutation.mutate(
      {
        id: areaToEdit.id,
        name: areaEditForm.name.trim(),
        latitude: Number(areaEditForm.latitude),
        longitude: Number(areaEditForm.longitude),
        radiusMeters: Number(areaEditForm.radiusMeters),
      },
      {
        onSuccess: (area) => {
          setAreaToEdit(null);
          setAreaEditForm(null);
          setAreaActionMessage(`'${area.name}' 작전지역이 수정되었습니다.`);
        },
        onError: (error) => {
          setAreaActionMessage(
            getAreaMutationErrorMessage(error, "작전지역 수정이 실패했습니다."),
          );
        },
      },
    );
  };

  const handleAreaDeleteConfirm = () => {
    if (!areaToDelete || removeAreaMutation.isPending) {
      return;
    }
    setAreaActionMessage(null);
    removeAreaMutation.mutate(areaToDelete.id, {
      onSuccess: () => {
        setAreaActionMessage(
          `'${areaToDelete.name}' 작전지역이 삭제되었습니다.`,
        );
        setAreaToDelete(null);
      },
      onError: (error) => {
        setAreaActionMessage(
          getAreaMutationErrorMessage(error, "작전지역 삭제가 실패했습니다."),
        );
        setAreaToDelete(null);
      },
    });
  };

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header__brand">
          <BrandLogo size={40} />
          <div className="app-header__brand-text">
            <span className="app-header__title">지휘보고 화면</span>
            <span className="app-header__eyebrow">
              실시간 상황 보고 수신 · 작전지역 현황
            </span>
          </div>
        </div>
        <div className="app-header__status app-header__status--spaced">
          <span className="app-header__status-item app-header__status-item--clock">
            <span className="app-header__status-label">현재 시각 (KST)</span>
            <span className="app-header__status-value">{clock}</span>
          </span>
          <span className="app-header__status-divider" />
          <span className="app-header__status-item">
            <span className="app-header__status-label">상황 보고</span>
            <span className="app-header__status-value">
              {reports.length}건
            </span>
          </span>
          <span className="app-header__status-divider" />
          <span className="app-header__status-item">
            <span className="app-header__status-label">저장 작전지역</span>
            <span className="app-header__status-value">
              {operationAreas.length}개
            </span>
          </span>
          <span className="app-header__status-divider" />
          <span className="app-header__status-item">
            <span className="app-header__status-label">활성 드론</span>
            <span className="app-header__status-value">
              {activeDroneCount}/{allDrones.length}대
            </span>
          </span>
          <span className="app-header__status-divider" />
          <StatusBadge tone="secondary">시뮬레이션 모드</StatusBadge>
        </div>
      </header>

      <div className="page-body">
        <div className="command-report-grid">
          {/* ===== 좌측: NAV + 최근 보고 목록 ===== */}
          <div className="cr-left">
            <AppPanel
              className="command-report-panel cr-nav-panel"
              flushBody
            >
              <nav className="cr-nav" aria-label="주요 화면">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    aria-disabled={
                      item.to === "/operation" && !hasOperationAreas
                    }
                    onClick={(event) => {
                      if (item.to === "/operation" && !hasOperationAreas) {
                        event.preventDefault();
                        setMonitorGuardMessage(noOperationAreaMessage);
                      }
                    }}
                    className={({ isActive }) =>
                      `cr-nav__item${isActive ? " is-active" : ""}${
                        item.to === "/operation" && !hasOperationAreas
                          ? " is-disabled"
                          : ""
                      }`
                    }
                  >
                    <span className="cr-nav__icon" aria-hidden>
                      {item.icon}
                    </span>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </AppPanel>

            <AppPanel
              className="command-report-panel cr-recent-panel"
              header={
                <PanelHeader
                  title="최근 보고 목록"
                  subtitle="최신순"
                  actions={
                    <span className="cr-recent__count">
                      전체 {reports.length}
                    </span>
                  }
                />
              }
              bodyClassName="scroll-body"
            >
              {recentReports.length === 0 ? (
                <p className="cr-recent__empty">등록된 보고가 없습니다.</p>
              ) : (
                <ul className="cr-recent">
                  {recentReports.map((report) => (
                    <li key={report.id}>
                      <button
                        type="button"
                        className={`cr-recent__row${
                          report.important ? " is-important" : ""
                        }${report.id === selectedReportId ? " is-selected" : ""}`}
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <span className="cr-recent__top">
                          <span className="cr-recent__time">
                            {formatReportDateTime(report.createdAt)}
                          </span>
                          {report.important ? (
                            <StatusBadge tone="danger">중요</StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">일반</StatusBadge>
                          )}
                        </span>
                        <span className="cr-recent__title">{report.title}</span>
                        <span className="cr-recent__ref">
                          <span className="cr-recent__id">
                            {report.droneId ?? "시스템 보고"}
                          </span>
                          <span className="cr-recent__target">
                            {report.targetId
                              ? `연관 표적 ${report.targetId}`
                              : `작전지역 ${report.areaId}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </AppPanel>
          </div>

          {/* ===== 중앙: 보고 카드 리스트 ===== */}
          <AppPanel
            className="command-report-panel"
            header={
              <PanelHeader title="지휘보고" subtitle="수신 상황 보고" />
            }
            bodyClassName="scroll-body"
          >
            <div className="cr-toolbar">
              <div className="seg-tabs" role="tablist" aria-label="보고 필터">
                {reportFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === option.value}
                    className={`seg-tab${filter === option.value ? " is-active" : ""}`}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                    <span className="seg-tab__count">
                      {tabCounts[option.value]}
                    </span>
                  </button>
                ))}
              </div>
              <span className="cr-sort">최신순</span>
            </div>
            <ReportList
              reports={filteredReports}
              dronesById={dronesById}
              selectedReportId={selectedReportId}
              onSelect={setSelectedReportId}
              onDetail={setReportToView}
              onMonitor={guardMonitorOpen}
            />
            {monitorGuardMessage ? (
              <p className="cr-guard-message" role="status">
                {monitorGuardMessage}
              </p>
            ) : null}
            {filteredReports.length > 0 ? (
              <p className="report-list__end">
                수신된 보고 {filteredReports.length}건을 모두 표시했습니다
              </p>
            ) : null}
          </AppPanel>

          {/* ===== 우측: 저장된 작전지역 현황 (생성은 통합 모니터링 화면으로 이관) ===== */}
          <AppPanel
            className="command-report-panel cr-area-panel"
            header={
              <PanelHeader
                title="작전지역 현황"
                subtitle="저장된 작전지역 · 운용 전환"
                actions={
                  <StatusBadge
                    tone={hasOperationAreas ? "primary" : "neutral"}
                  >
                    {operationAreas.length}개
                  </StatusBadge>
                }
              />
            }
            bodyClassName="cr-area-body"
          >
            <AreaList
              areas={operationAreas}
              droneCountByArea={droneCountByArea}
              emptyDescription="작전지역은 통합 모니터링 화면에서 생성합니다."
              onMonitor={guardMonitorOpen}
              onScenario={openScenarioWindow}
              onEdit={handleAreaEditOpen}
              onDelete={(areaId) =>
                setAreaToDelete(
                  operationAreas.find((area) => area.id === areaId) ?? null,
                )
              }
            />
            {operationAreasQuery.isLoading ? (
              <p className="cr-area-status">작전지역 목록을 불러오는 중입니다.</p>
            ) : null}
            {operationAreasQuery.isError ? (
              <p className="cr-area-status cr-area-status--error">
                작전지역 목록을 불러오지 못했습니다.
              </p>
            ) : null}
            {areaActionMessage ? (
              <p className="cr-area-status" role="status">
                {areaActionMessage}
              </p>
            ) : null}
          </AppPanel>
        </div>
      </div>

      <ReportDetailModal
        report={reportToViewData}
        onClose={() => setReportToView(null)}
        onMonitor={(areaId) => {
          guardMonitorOpen(areaId);
          setReportToView(null);
        }}
      />

      <ConfirmModal
        open={areaToDelete !== null}
        tone="danger"
        title="작전지역 삭제"
        description={
          areaToDelete
            ? `'${areaToDelete.name}' 작전지역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
            : undefined
        }
        confirmLabel={removeAreaMutation.isPending ? "삭제 중..." : "삭제"}
        onConfirm={handleAreaDeleteConfirm}
        onClose={() => {
          if (!removeAreaMutation.isPending) {
            setAreaToDelete(null);
          }
        }}
      />

      <FormModal
        open={areaToEdit !== null}
        title="작전지역 수정"
        description="작전지역 정보를 수정합니다."
        submitLabel={
          updateAreaMutation.isPending ? "저장 중..." : "변경 저장"
        }
        submitDisabled={!isAreaEditFormValid || updateAreaMutation.isPending}
        onSubmit={handleAreaEditSubmit}
        onClose={handleAreaEditClose}
      >
        {areaEditForm ? (
          <>
            <TextInput
              label="작전지역 이름"
              required
              value={areaEditForm.name}
              onChange={(event) =>
                setAreaEditForm((prev) =>
                  prev ? { ...prev, name: event.target.value } : prev,
                )
              }
            />
            <div className="ui-form-row">
              <NumberInput
                label="위도"
                required
                step="any"
                value={areaEditForm.latitude}
                onChange={(event) =>
                  setAreaEditForm((prev) =>
                    prev ? { ...prev, latitude: event.target.value } : prev,
                  )
                }
              />
              <NumberInput
                label="경도"
                required
                step="any"
                value={areaEditForm.longitude}
                onChange={(event) =>
                  setAreaEditForm((prev) =>
                    prev ? { ...prev, longitude: event.target.value } : prev,
                  )
                }
              />
            </div>
            <NumberInput
              label="반경"
              unit="m"
              required
              min={0}
              value={areaEditForm.radiusMeters}
              onChange={(event) =>
                setAreaEditForm((prev) =>
                  prev ? { ...prev, radiusMeters: event.target.value } : prev,
                )
              }
            />
          </>
        ) : null}
      </FormModal>
    </div>
  );
}
