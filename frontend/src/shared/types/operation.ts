import type { ActiveScenario } from "./scenario";
import type { Drone } from "./drone";
import type { EnemyArea } from "./enemyArea";
import type { Target } from "./target";

export type OperationSnapshot = {
  enemyArea: EnemyArea;
  drones: Drone[];
  targets: Target[];
  activeScenarios: ActiveScenario[];
};
