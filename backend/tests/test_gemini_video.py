import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from requests.exceptions import Timeout

from backend.gemini_video.service import run_analysis, validate_output, validate_delivery_output


VALID = [{"start_time": "00:01.000", "end_time": "00:03.500", "content": "시선이 아래를 향합니다."}]


def response(text=None, status=200, finish="STOP", payload=None):
    if payload is None:
        try:
            parsed = json.loads(text or "[]")
            if isinstance(parsed, list):
                text = json.dumps({"nonverbal_feedback": parsed, "vocal_feedback": []})
        except ValueError:
            pass
        payload = {"candidates": [{"finishReason": finish, "content": {"parts": [{"text": text or "[]"}]}}],
                   "modelVersion": "gemini-3.8-flash", "usageMetadata": {"promptTokenCount": 100, "totalTokenCount": 110}}
    return Mock(status_code=status, ok=200 <= status < 300, text=json.dumps(payload), json=Mock(return_value=payload))


class ValidationTests(unittest.TestCase):
    def test_valid_empty_and_overlapping_events(self):
        self.assertEqual(validate_output("[]", 48), [])
        events = VALID + [{"start_time": "00:02.000", "end_time": "00:04.000", "content": "긴 공백이 있습니다."}]
        self.assertEqual(validate_output(json.dumps(events), 48), events)

    def test_rejects_invalid_contract(self):
        variants = [
            {}, [{"time": "00:01", "problem": "test"}],
            [{**VALID[0], "extra": "x"}], [{**VALID[0], "content": "  "}],
            [{**VALID[0], "content": 1}], [{**VALID[0], "start_time": 1}],
            [{**VALID[0], "start_time": "00:61.000"}],
            [{**VALID[0], "end_time": "00:01.000"}],
            [{**VALID[0], "end_time": "00:00.500"}],
            [{**VALID[0], "end_time": "00:49.000"}],
            VALID + VALID,
            [{**VALID[0], "start_time": "00:02.000"}] + VALID,
        ]
        for item in variants:
            with self.subTest(item=item), self.assertRaises(ValueError):
                validate_output(json.dumps(item), 48)
        for text in ['```json\n[]\n```', '[{"start_time":"00:01.000","start_time":"00:02.000","end_time":"00:03.000","content":"x"}]']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                validate_output(text, 48)


class RetryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.video = self.root / "input.mp4"
        self.video.write_bytes(b"fake media for mocked transport")
        self.output = self.root / "out"
        self.sleep = Mock()

    def tearDown(self):
        self.directory.cleanup()

    def run_case(self, replies, attempts=3):
        session = Mock()
        session.post.side_effect = replies
        status = run_analysis(self.video, self.output, "test-project", "gemini-3.8-flash", 48,
                              session, max_attempts=attempts, sleep=self.sleep)
        meta = json.loads((self.output / "presentation-analysis-meta.json").read_text())
        logs = [json.loads(line) for line in Path(meta["log_file"]).read_text().splitlines()]
        return status, session, meta, logs

    def test_validation_failure_then_success_logs_both_attempts(self):
        status, session, meta, logs = self.run_case([response('{"old":"format"}'), response(json.dumps(VALID))])
        self.assertEqual(status, 0)
        self.assertEqual(session.post.call_count, 2)
        self.assertEqual((meta["attempt_count"], meta["retry_count"]), (2, 1))
        self.assertEqual(meta["usage_total"]["promptTokenCount"], 200)
        self.assertEqual([a["status"] for a in meta["attempts"]], ["validation_error", "success"])
        self.assertEqual(self.sleep.call_args.args, (2,))
        self.assertEqual(json.loads((self.output / "presentation-analysis.json").read_text()), {"nonverbal_feedback": VALID, "vocal_feedback": []})
        self.assertEqual(sum(e["event"] == "attempt_finished" for e in logs), 2)
        self.assertTrue(Path(meta["attempts"][0]["response_file"]).exists())

    def test_exhaustion_preserves_previous_valid_result(self):
        self.output.mkdir()
        existing = self.output / "presentation-analysis.json"
        existing.write_text(json.dumps(VALID))
        status, session, meta, logs = self.run_case([response("invalid")] * 3)
        self.assertEqual(status, 1)
        self.assertEqual(session.post.call_count, 3)
        self.assertEqual(meta["retry_count"], 2)
        self.assertEqual(meta["status"], "failed")
        self.assertEqual(json.loads(existing.read_text()), VALID)
        self.assertEqual([call.args[0] for call in self.sleep.call_args_list], [2, 4])
        self.assertEqual(logs[-1]["event"], "run_finished")

    def test_transient_http_and_network_errors_retry(self):
        status, session, meta, _ = self.run_case([
            response(status=429, payload={"error": {"message": "rate limit"}}),
            Timeout("test timeout"), response("[]")])
        self.assertEqual(status, 0)
        self.assertEqual(session.post.call_count, 3)
        self.assertEqual([a["status"] for a in meta["attempts"]], ["http_error", "network_error", "success"])

    def test_vocal_feedback_uses_the_same_timestamp_schema_and_one_request(self):
        vocal = [{"start_time": "00:05.000", "end_time": "00:08.000",
                  "content": "말 속도: 문장 끝을 급하게 이어 말합니다. 핵심어 뒤에 짧게 쉬어주세요."}]
        status, session, meta, _ = self.run_case([response(json.dumps({"nonverbal_feedback": [], "vocal_feedback": vocal}))])
        self.assertEqual(status, 0)
        self.assertEqual(session.post.call_count, 1)
        self.assertEqual(meta["assessment_scope"], ["visual", "vocal"])
        body = session.post.call_args.kwargs["json"]
        self.assertEqual(body["contents"][0]["parts"][0]["inlineData"]["mimeType"], "video/mp4")
        self.assertEqual(set(vocal[0]), {"start_time", "end_time", "content"})
        self.assertEqual(json.loads((self.output / "presentation-analysis.json").read_text())["vocal_feedback"], vocal)

    def test_permission_error_does_not_retry(self):
        status, session, meta, _ = self.run_case([response(status=403, payload={"error": {"message": "permission denied"}})])
        self.assertEqual(status, 1)
        self.assertEqual(session.post.call_count, 1)
        self.assertEqual(meta["retry_count"], 0)
        self.sleep.assert_not_called()

    def test_safety_block_does_not_retry(self):
        status, session, meta, _ = self.run_case([response(finish="SAFETY")])
        self.assertEqual(status, 1)
        self.assertEqual(session.post.call_count, 1)
        self.assertEqual(meta["attempts"][0]["status"], "blocked")

    def test_truncated_response_retries(self):
        status, session, meta, _ = self.run_case([response("[]", finish="MAX_TOKENS"), response("[]")])
        self.assertEqual(status, 0)
        self.assertEqual(meta["attempt_count"], 2)


if __name__ == "__main__":
    unittest.main()


def test_split_feedback_requires_both_arrays_and_validates_each():
    import pytest
    valid = {"nonverbal_feedback": VALID, "vocal_feedback": [{"start_time":"00:00.000","end_time":"00:01.000","content":"Speech starts abruptly."}]}
    assert validate_delivery_output(json.dumps(valid), 48) == valid
    for invalid in [[], {"nonverbal_feedback": []}, {**valid,"extra":[]},
                    {**valid,"vocal_feedback":{}},
                    {**valid,"vocal_feedback":[{"start_time":"00:00.000","end_time":"00:49.000","content":"Too late"}]}]:
        with pytest.raises(ValueError):validate_delivery_output(json.dumps(invalid), 48)
