from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.core.defaults import (
    ALERT_MESSAGES,
    ALERT_REGIONS,
    DEFAULT_ALERT_ENTER_MS,
    DEFAULT_ALERT_EXIT_MS,
    DEFAULT_ALERT_HYSTERESIS,
)
from app.schemas.analysis import (
    AnalysisConfig,
    DeliveryAlert,
    ThresholdConfig,
    WindowAnalysis,
)
from app.utils.ids import new_id

MetricName = Literal["gaze", "expression_activity", "stability", "expressiveness"]
AlertState = Literal["normal", "warning", "critical"]

METRICS: tuple[MetricName, ...] = (
    "gaze",
    "expression_activity",
    "stability",
    "expressiveness",
)


def classify_score(
    score: int | None,
    warning: int,
    critical: int,
    hysteresis: int,
    current: AlertState,
) -> AlertState | None:
    """Desired class from a window score.

    None means missing data: do not enter a warning; allow recovery.
    Scores inside the hysteresis band hold the current non-normal state.
    """
    if score is None:
        return "normal"
    if score < critical:
        return "critical"
    if score < warning:
        return "warning"
    if current != "normal" and score < warning + hysteresis:
        return current if current == "warning" else "warning"
    return "normal"


@dataclass
class _MetricMachine:
    state: AlertState = "normal"
    pending: AlertState | None = None
    pending_since_ms: int | None = None
    open_id: str | None = None
    open_start_ms: int | None = None


@dataclass
class AlertTracker:
    """Stateful NORMAL → WARNING → CRITICAL machine with persistence + hysteresis."""

    enter_ms: int = DEFAULT_ALERT_ENTER_MS
    exit_ms: int = DEFAULT_ALERT_EXIT_MS
    hysteresis: int = DEFAULT_ALERT_HYSTERESIS
    _machines: dict[MetricName, _MetricMachine] = field(default_factory=dict)
    history: list[DeliveryAlert] = field(default_factory=list)

    def _machine(self, metric: MetricName) -> _MetricMachine:
        if metric not in self._machines:
            self._machines[metric] = _MetricMachine()
        return self._machines[metric]

    def observe(
        self,
        timestamp_ms: int,
        scores: dict[str, int | None],
        thresholds: ThresholdConfig,
    ) -> list[DeliveryAlert]:
        thresh = thresholds.model_dump(by_alias=False)
        active: list[DeliveryAlert] = []
        for metric in METRICS:
            machine = self._machine(metric)
            warning = int(thresh[metric]["warning"])
            critical = int(thresh[metric]["critical"])
            desired = classify_score(
                scores.get(metric),
                warning,
                critical,
                self.hysteresis,
                machine.state,
            )
            persist = self.enter_ms if _is_escalation(machine.state, desired) else self.exit_ms
            if desired != machine.state:
                if machine.pending != desired:
                    machine.pending = desired
                    machine.pending_since_ms = timestamp_ms
                elapsed = timestamp_ms - (machine.pending_since_ms or timestamp_ms)
                if elapsed >= persist:
                    self._transition(metric, machine, desired, timestamp_ms)
            else:
                machine.pending = None
                machine.pending_since_ms = None
            if machine.state != "normal" and machine.open_id and machine.open_start_ms is not None:
                active.append(
                    _alert(
                        machine.open_id,
                        metric,
                        machine.state,  # type: ignore[arg-type]
                        machine.open_start_ms,
                        None,
                    )
                )
        return active

    def _transition(
        self,
        metric: MetricName,
        machine: _MetricMachine,
        desired: AlertState,
        timestamp_ms: int,
    ) -> None:
        start = machine.pending_since_ms or timestamp_ms
        if machine.open_id and machine.open_start_ms is not None:
            self.history.append(
                _alert(
                    machine.open_id,
                    metric,
                    machine.state,  # type: ignore[arg-type]
                    machine.open_start_ms,
                    timestamp_ms,
                )
            )
            machine.open_id = None
            machine.open_start_ms = None
        machine.state = desired
        machine.pending = None
        machine.pending_since_ms = None
        if desired != "normal":
            machine.open_id = new_id("alrt")
            machine.open_start_ms = start

    def close_open(self, timestamp_ms: int) -> None:
        for metric, machine in self._machines.items():
            if machine.state != "normal" and machine.open_id and machine.open_start_ms is not None:
                self.history.append(
                    _alert(
                        machine.open_id,
                        metric,
                        machine.state,  # type: ignore[arg-type]
                        machine.open_start_ms,
                        timestamp_ms,
                    )
                )
            machine.state = "normal"
            machine.open_id = None
            machine.open_start_ms = None
            machine.pending = None
            machine.pending_since_ms = None

    def active_alerts(self) -> list[DeliveryAlert]:
        active: list[DeliveryAlert] = []
        for metric, machine in self._machines.items():
            if machine.state != "normal" and machine.open_id and machine.open_start_ms is not None:
                active.append(
                    _alert(
                        machine.open_id,
                        metric,
                        machine.state,  # type: ignore[arg-type]
                        machine.open_start_ms,
                        None,
                    )
                )
        return active

    def all_alerts(self) -> list[DeliveryAlert]:
        return list(self.history)


def alerts_from_windows(
    windows: list[WindowAnalysis],
    config: AnalysisConfig,
) -> list[DeliveryAlert]:
    tracker = AlertTracker(
        enter_ms=config.alert_enter_ms,
        exit_ms=config.alert_exit_ms,
        hysteresis=config.alert_hysteresis,
    )
    for window in windows:
        scores = {
            "gaze": window.metrics.gaze,
            "expression_activity": window.metrics.expression_activity,
            "stability": window.metrics.stability,
            "expressiveness": window.metrics.expressiveness,
        }
        tracker.observe(window.end_ms, scores, config.thresholds)
    if windows:
        tracker.close_open(windows[-1].end_ms)
    return tracker.all_alerts()


def _is_escalation(current: AlertState, desired: AlertState) -> bool:
    return _severity_rank(desired) > _severity_rank(current)


def _severity_rank(state: AlertState) -> int:
    return {"normal": 0, "warning": 1, "critical": 2}[state]


def _alert(
    alert_id: str,
    metric: MetricName,
    severity: Literal["warning", "critical"],
    start_ms: int,
    end_ms: int | None,
) -> DeliveryAlert:
    return DeliveryAlert(
        id=alert_id,
        metric=metric,
        severity=severity,
        region=ALERT_REGIONS[metric],
        message=ALERT_MESSAGES[metric][severity],
        start_ms=start_ms,
        end_ms=end_ms,
        duration_ms=(end_ms - start_ms) if end_ms is not None else None,
    )
