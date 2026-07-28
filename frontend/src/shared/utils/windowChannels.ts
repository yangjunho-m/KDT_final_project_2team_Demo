export type EnemyAreaChangeMessage = {
  type: "CHANGE_ENEMY_AREA";
  areaId: string;
};

type EnemyAreaChangeHandler = (areaId: string) => void;

export function postEnemyAreaChange(channelName: string, areaId: string) {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ type: "CHANGE_ENEMY_AREA", areaId });
  channel.close();
}

export function subscribeEnemyAreaChange(
  channelName: string,
  handler: EnemyAreaChangeHandler,
) {
  if (typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }

  const channel = new BroadcastChannel(channelName);

  channel.onmessage = (event: MessageEvent<EnemyAreaChangeMessage>) => {
    if (event.data?.type === "CHANGE_ENEMY_AREA") {
      handler(event.data.areaId);
    }
  };

  return () => channel.close();
}
