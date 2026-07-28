/**
 * 서버 realtime 연동에서 제외되는 로컬 전용 areaId.
 * (예: 생성 폼 미리보기 등 서버에 존재하지 않는 화면 전용 ID)
 */
const LOCAL_ONLY_AREA_IDS = new Set(["AREA-NEW"]);

/** WebSocket 연결/이벤트 sync/cleanup 공통 area 가드. */
export function canUseRealtimeAreaId(areaId: string | null): areaId is string {
  return (
    areaId !== null &&
    areaId.trim().length > 0 &&
    !LOCAL_ONLY_AREA_IDS.has(areaId)
  );
}
