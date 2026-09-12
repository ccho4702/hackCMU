from app.utils.piecewise import clamp_score, piecewise_linear, round_score


def test_piecewise_interior():
    points = [(0.0, 0.0), (10.0, 100.0)]
    assert piecewise_linear(5.0, points) == 50.0


def test_piecewise_clamps_to_ends():
    points = [(1.0, 10.0), (3.0, 30.0)]
    assert piecewise_linear(-5.0, points) == 10.0
    assert piecewise_linear(9.0, points) == 30.0


def test_score_bounds():
    assert clamp_score(-12) == 0.0
    assert clamp_score(140) == 100.0
    assert round_score(None) is None
    assert round_score(87.4) == 87
