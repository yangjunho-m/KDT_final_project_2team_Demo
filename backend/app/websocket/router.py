from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder

from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


@router.websocket("/ws/realtime")
async def realtime_websocket(
    websocket: WebSocket,
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
) -> None:
    await realtime_manager.connect(websocket, operation_area_id)
    await websocket.send_json(
        jsonable_encoder(
            build_realtime_event(
                "websocket.connected",
                operation_area_id=operation_area_id,
                entity_id="websocket",
                payload={
                    "message": "실시간 이벤트 연결이 완료되었습니다.",
                    "operationAreaId": operation_area_id,
                },
            )
        )
    )

    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json(
                    jsonable_encoder(
                        build_realtime_event(
                            "heartbeat",
                            operation_area_id=operation_area_id,
                            entity_id="websocket",
                            payload={"message": "pong"},
                        )
                    )
                )
    except WebSocketDisconnect:
        realtime_manager.disconnect(websocket)
