export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  enemyAreas: ["enemyAreas"] as const,
  operationSnapshot: (areaId: string) =>
    ["operationSnapshot", areaId] as const,
  drones: ["drones"] as const,
  droneViewRoutes: ["droneViewRoutes"] as const,
  scenarioRuns: {
    all: ["scenarioRuns"] as const,
    active: (areaId: string) => ["scenarioRuns", "active", areaId] as const,
    detail: (runId: string) => ["scenarioRuns", "detail", runId] as const,
  },
  scenarioTemplates: {
    list: (scenarioType?: string) =>
      ["scenarioTemplates", "list", scenarioType ?? "all"] as const,
    detail: (templateId: string) =>
      ["scenarioTemplates", "detail", templateId] as const,
  },
  reports: ["reports"] as const,
};
