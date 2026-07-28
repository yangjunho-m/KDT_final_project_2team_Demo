import type {
  SituationReport,
  SituationReportCreateInput,
} from "../shared/types";
import { apiClient, type ApiRequestOptions } from "./apiClient";
import { reportDtoToModel, type BackendReportDto } from "./dtoMappers";

type BackendReportListDto = {
  items: BackendReportDto[];
  page?: {
    page: number;
    size: number;
    total: number;
  };
};

type ReportCreateRequestDto = {
  operationAreaId: string;
  title: string;
  content: string;
  important: boolean;
  clientRequestId: string;
  droneId?: string;
  targetId?: string;
  scenarioId?: string;
  reportPosition?: {
    latitude: number;
    longitude: number;
  };
};

export async function fetchReports(
  options?: ApiRequestOptions,
): Promise<SituationReport[]> {
  const data = await apiClient.get<BackendReportListDto>(
    "/api/reports?page=1&size=100",
    options,
  );
  return data.items.map(reportDtoToModel);
}

export async function createSituationReport(
  input: SituationReportCreateInput,
): Promise<SituationReport> {
  const body: ReportCreateRequestDto = {
    operationAreaId: input.areaId,
    title: input.title,
    content: input.content,
    important: input.important,
    clientRequestId: input.clientRequestId,
    ...(input.droneId ? { droneId: input.droneId } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.reference.scenarioId
      ? { scenarioId: input.reference.scenarioId }
      : {}),
    ...(input.reportPosition
      ? {
          reportPosition: {
            latitude: input.reportPosition.latitude,
            longitude: input.reportPosition.longitude,
          },
        }
      : {}),
  };
  const data = await apiClient.post<BackendReportDto, ReportCreateRequestDto>(
    "/api/reports",
    body,
  );
  return reportDtoToModel(data);
}
