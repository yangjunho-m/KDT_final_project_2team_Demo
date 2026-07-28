import type {
  ActiveScenario,
  Drone,
  DroneNavigationStatus,
  DroneStatus,
  EnemyArea,
  OperationSnapshot,
  ReportReference,
  SituationReport,
  Target,
  TargetStatus,
  ThreeDimensionalCoordinate,
} from "../shared/types";

export type BackendPositionDto = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
};

export type BackendOperationAreaDto = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  createdAt: string;
  updatedAt: string;
};

export type BackendDroneDto = {
  id: string;
  name: string;
  operationAreaId?: string | null;
  model?: string | null;
  missionType?: string | null;
  iconImageUrl?: string | null;
  cardImageUrl?: string | null;
  departurePosition?: BackendPositionDto | null;
  currentPosition?: BackendPositionDto | null;
  movementTarget?: BackendPositionDto | null;
  status?: string;
  heading?: number;
  battery?: number;
  altitude?: number;
  speed?: number;
  signalStatus?: string;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BackendTargetDto = {
  id: string;
  operationAreaId?: string | null;
  type?: string | null;
  name?: string | null;
  status?: string;
  position: BackendPositionDto;
  confidence?: number | null;
  imageUrl?: string | null;
  lastUpdatedAt?: string | null;
  updatedAt?: string | null;
};

export type BackendScenarioDto = {
  id: string;
  operationAreaId?: string | null;
  effect?: {
    type?: string;
  };
  status?: string;
  targetDroneIds?: string[];
  startedAt?: string;
  endedAt?: string | null;
};

export type BackendReportDto = {
  id: string;
  operationAreaId?: string | null;
  title: string;
  content?: string | null;
  summary?: string | null;
  important?: boolean;
  droneId?: string | null;
  targetId?: string | null;
  scenarioId?: string | null;
  position?: BackendPositionDto | null;
  reportPosition?: BackendPositionDto | null;
  createdAt: string;
};

export type BackendOperationSnapshotDto = {
  operationArea: BackendOperationAreaDto;
  drones?: BackendDroneDto[];
  targets?: BackendTargetDto[];
  activeScenarios?: BackendScenarioDto[];
  reports?: BackendReportDto[];
};

export type BackendItemsDto<TItem> = {
  items: TItem[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positionDtoToModel(
  position: BackendPositionDto | null | undefined,
  fieldName: string,
): ThreeDimensionalCoordinate {
  if (
    !position ||
    !isFiniteNumber(position.latitude) ||
    !isFiniteNumber(position.longitude) ||
    !isFiniteNumber(position.altitude)
  ) {
    throw new Error(`Invalid drone ${fieldName} response.`);
  }

  return {
    latitude: position.latitude,
    longitude: position.longitude,
    altitude: position.altitude,
  };
}

function mapDroneStatus(status: string | undefined): DroneStatus {
  switch (status) {
    case "READY":
      return "ready";
    case "MOVING":
      return "moving";
    case "DISCONNECTED":
      return "offline";
    case "UNASSIGNED":
    default:
      return "warning";
  }
}

function mapDroneNavigationStatus(
  signalStatus: string | undefined,
): DroneNavigationStatus {
  switch (signalStatus) {
    case "NORMAL":
      return "normal";
    case "DEGRADED":
      return "gnss_unstable";
    case "LOST":
    default:
      return "manual_control";
  }
}

function mapTargetStatus(status: string | undefined): TargetStatus {
  switch (status) {
    case "ACTIVE":
      return "detected";
    case "LOST":
      return "lost";
    case "REMOVED":
      return "resolved";
    default:
      return "tracking";
  }
}

function mapScenarioType(type: string | undefined): ActiveScenario["type"] {
  switch (type) {
    case "JAMMING":
      return "communication_jamming";
    case "SPOOFING":
      return "gnss_disruption";
    default:
      return "communication_jamming";
  }
}

function mapScenarioStatus(status: string | undefined): ActiveScenario["status"] {
  switch (status) {
    case "RUNNING":
      return "active";
    case "ENDED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

export function operationAreaDtoToModel(dto: BackendOperationAreaDto): EnemyArea {
  return {
    id: dto.id,
    name: dto.name,
    latitude: dto.latitude,
    longitude: dto.longitude,
    radiusMeters: dto.radiusMeters,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function droneDtoToModel(dto: BackendDroneDto): Drone {
  const departurePosition = positionDtoToModel(
    dto.departurePosition,
    "departurePosition",
  );
  const currentPosition = positionDtoToModel(
    dto.currentPosition,
    "currentPosition",
  );
  const movementTarget = dto.movementTarget
    ? positionDtoToModel(dto.movementTarget, "movementTarget")
    : undefined;

  return {
    id: dto.id,
    areaId: dto.operationAreaId ?? "",
    name: dto.name,
    model: dto.model ?? undefined,
    missionType: dto.missionType ?? undefined,
    departurePosition,
    currentPosition,
    movementTarget,
    headingDegrees: dto.heading ?? 0,
    batteryPercent: dto.battery ?? 100,
    status: mapDroneStatus(dto.status),
    navigationStatus: mapDroneNavigationStatus(dto.signalStatus),
    iconImageUrl: dto.iconImageUrl ?? undefined,
    cardImageUrl: dto.cardImageUrl ?? undefined,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

/**
 * 목록 응답 방어 매핑: 위치 필드가 깨진 드론 1대 때문에 화면 전체가
 * 실패하지 않도록 해당 항목만 제외하고 경고를 남긴다.
 * (단건 응답 — 등록/해제 mutation 결과 — 은 droneDtoToModel이 그대로 throw)
 */
export function droneDtosToModels(dtos: BackendDroneDto[]): Drone[] {
  const drones: Drone[] = [];
  for (const dto of dtos) {
    try {
      drones.push(droneDtoToModel(dto));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(
          `[dtoMappers] drone ${dto.id ?? "(no id)"} skipped:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return drones;
}

export function targetDtoToModel(dto: BackendTargetDto): Target {
  return {
    id: dto.id,
    areaId: dto.operationAreaId ?? "",
    name: dto.name ?? dto.type ?? dto.id,
    position: {
      latitude: dto.position.latitude,
      longitude: dto.position.longitude,
    },
    status: mapTargetStatus(dto.status),
    confidence: dto.confidence ?? 0,
    imageUrl: dto.imageUrl ?? undefined,
    detectedAt: dto.lastUpdatedAt ?? dto.updatedAt ?? "",
    updatedAt: dto.updatedAt ?? dto.lastUpdatedAt ?? "",
  };
}

export function scenarioDtoToModel(dto: BackendScenarioDto): ActiveScenario {
  return {
    id: dto.id,
    areaId: dto.operationAreaId ?? "",
    type: mapScenarioType(dto.effect?.type),
    status: mapScenarioStatus(dto.status),
    selectedDroneIds: dto.targetDroneIds ?? [],
    startedAt: dto.startedAt ?? "",
    endedAt: dto.endedAt ?? undefined,
  };
}

export function reportDtoToModel(dto: BackendReportDto): SituationReport {
  const reportPosition = dto.reportPosition ?? dto.position;
  const reference: ReportReference = {
    areaId: dto.operationAreaId ?? "",
    areaPosition: {
      latitude: reportPosition?.latitude ?? 0,
      longitude: reportPosition?.longitude ?? 0,
    },
    scenarioId: dto.scenarioId ?? undefined,
  };

  return {
    id: dto.id,
    areaId: dto.operationAreaId ?? "",
    title: dto.title,
    content: dto.content ?? dto.summary ?? "",
    important: dto.important ?? false,
    position: reference.areaPosition,
    droneId: dto.droneId ?? null,
    targetId: dto.targetId ?? null,
    reference,
    createdAt: dto.createdAt,
  };
}

export function snapshotDtoToModel(
  dto: BackendOperationSnapshotDto,
): OperationSnapshot {
  return {
    enemyArea: operationAreaDtoToModel(dto.operationArea),
    drones: droneDtosToModels(dto.drones ?? []),
    targets: (dto.targets ?? []).map(targetDtoToModel),
    activeScenarios: (dto.activeScenarios ?? []).map(scenarioDtoToModel),
  };
}
