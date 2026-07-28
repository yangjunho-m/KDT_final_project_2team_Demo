from datetime import UTC, datetime
from uuid import uuid4

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[WebSocket, str | None] = {}

    async def connect(self, websocket: WebSocket, operation_area_id: str | None = None) -> None:
        await websocket.accept()
        self._connections[websocket] = operation_area_id

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    async def broadcast(self, event: dict[str, object]) -> None:
        disconnected: list[WebSocket] = []
        event_operation_area_id = event.get("operationAreaId")
        for websocket, subscribed_area_id in list(self._connections.items()):
            if subscribed_area_id and event_operation_area_id != subscribed_area_id:
                continue
            try:
                await websocket.send_json(jsonable_encoder(event))
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


realtime_manager = RealtimeConnectionManager()


def build_realtime_event(
    event_type: str,
    *,
    operation_area_id: str | None,
    entity_id: str,
    payload: object,
) -> dict[str, object]:
    occurred_at = datetime.now(UTC)
    return {
        "type": event_type,
        "eventType": event_type,
        "operationAreaId": operation_area_id,
        "entityId": entity_id,
        "eventId": f"EVT-{uuid4().hex[:12].upper()}",
        "occurredAt": occurred_at,
        "payload": payload,
    }
