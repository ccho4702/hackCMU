import numpy as np

from backend.app.features.head_pose import (
    head_pose_from_matrix,
    rotation_to_yaw_pitch_roll,
    yaw_pitch_roll_to_rotation,
)


def test_round_trip_known_angles():
    R = yaw_pitch_roll_to_rotation(25.0, -10.0, 8.0)
    yaw, pitch, roll = rotation_to_yaw_pitch_roll(R)
    assert abs(yaw - 25.0) < 1e-6
    assert abs(pitch + 10.0) < 1e-6
    assert abs(roll - 8.0) < 1e-6


def test_identity_is_near_zero():
    pose = head_pose_from_matrix(np.eye(4))
    assert pose is not None
    assert abs(pose.yaw_deg) < 1e-6
    assert abs(pose.pitch_deg) < 1e-6
    assert abs(pose.roll_deg) < 1e-6


def test_positive_yaw_sign():
    R = yaw_pitch_roll_to_rotation(15.0, 0.0, 0.0)
    matrix = np.eye(4)
    matrix[:3, :3] = R
    pose = head_pose_from_matrix(matrix)
    assert pose is not None
    assert pose.yaw_deg > 10
