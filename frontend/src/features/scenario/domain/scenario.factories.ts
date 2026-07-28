import type {
  JammingConfig,
  ScenarioDraftState,
  SpoofingDraftConfig,
} from "./scenario.types";

export function createEmptyScenarioDraft(areaId?: string): ScenarioDraftState {
  return {
    areaId: areaId ?? null,
    scenarioType: null,
    config: null,
    interferenceZone: null,
  };
}

export function createDefaultJammingConfig(): JammingConfig {
  return {
    type: "JAMMING",
    targetSystem: "GNSS",
    intensity: "MEDIUM",
  };
}

export function createDefaultSpoofingConfig(): SpoofingDraftConfig {
  return {
    type: "SPOOFING",
    severity: "MEDIUM",
    spoofedPosition: null,
  };
}
