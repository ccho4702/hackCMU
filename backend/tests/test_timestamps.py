from backend.app.utils.timestamps import ensure_monotonic_ms, sample_timestamps_ms


def test_sample_timestamps_are_time_based():
    stamps = sample_timestamps_ms(1000, 10)
    assert stamps[0] == 0
    assert all(stamps[i] < stamps[i + 1] for i in range(len(stamps) - 1))
    assert max(stamps) <= 1000


def test_monotonic_guard():
    assert ensure_monotonic_ms(None, 12) == 12
    assert ensure_monotonic_ms(40, 40) == 41
    assert ensure_monotonic_ms(40, 39) == 41
    assert ensure_monotonic_ms(40, 50) == 50
