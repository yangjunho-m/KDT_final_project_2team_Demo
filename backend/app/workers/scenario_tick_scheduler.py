import asyncio
from contextlib import suppress

from sqlalchemy import text

from app.db import SessionLocal
from app.services.scenario_run_service import advance_scenario_run_tick, list_active_scenario_run_ids
from app.websocket.manager import realtime_manager


SCENARIO_TICK_LOCK_ID = 2026070601


class ScenarioTickScheduler:
    def __init__(self, *, interval_seconds: float = 1.0) -> None:
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run(), name="scenario-tick-scheduler")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task

    async def _run(self) -> None:
        while not self._stopping.is_set():
            await self.tick_once()
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                continue

    async def tick_once(self) -> None:
        with SessionLocal() as db:
            lock_acquired = _try_acquire_scheduler_lock(db)
            if not lock_acquired:
                return

            try:
                run_ids = list_active_scenario_run_ids(db)
                for run_id in run_ids:
                    try:
                        tick_result = advance_scenario_run_tick(db, run_id=run_id)
                    except Exception:
                        continue
                    for event in tick_result["events"]:
                        await realtime_manager.broadcast(event)
            finally:
                _release_scheduler_lock(db)


def _try_acquire_scheduler_lock(db) -> bool:
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return True
    return bool(db.scalar(text("SELECT pg_try_advisory_lock(:lock_id)"), {"lock_id": SCENARIO_TICK_LOCK_ID}))


def _release_scheduler_lock(db) -> None:
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return
    db.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": SCENARIO_TICK_LOCK_ID})
