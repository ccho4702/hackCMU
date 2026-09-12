from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class JobRunner:
    """In-process worker. Replace with Redis/Celery later without API changes."""

    def __init__(self, max_workers: int = 1):
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, max_workers),
            thread_name_prefix="analysis",
        )
        self._cancel: dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def cancel_event(self, analysis_id: str) -> threading.Event:
        with self._lock:
            event = self._cancel.get(analysis_id)
            if event is None:
                event = threading.Event()
                self._cancel[analysis_id] = event
            return event

    def submit(self, analysis_id: str, fn) -> None:
        event = self.cancel_event(analysis_id)
        self._executor.submit(self._run, analysis_id, fn, event)

    def cancel(self, analysis_id: str) -> None:
        self.cancel_event(analysis_id).set()

    def _run(self, analysis_id: str, fn, event: threading.Event) -> None:
        try:
            fn(event)
        except Exception:
            logger.exception("Analysis worker failed for %s", analysis_id)
        finally:
            with self._lock:
                self._cancel.pop(analysis_id, None)
