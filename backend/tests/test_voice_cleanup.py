"""Voice lifecycle regressions: never delete another run's voice or lose its audio."""
import base64
import json
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from elevenlabs.core.api_error import ApiError

from backend.elevenlabs_tts.service import run_pipeline


@pytest.fixture
def speech_run(tmp_path):
    sample = tmp_path / 'sample.mp3'
    sample.write_bytes(b'this recording')
    client = Mock()
    client.voices.ivc.create.return_value = SimpleNamespace(voice_id='this-run-only', requires_verification=False)
    client.text_to_speech.convert_with_timestamps.return_value = SimpleNamespace(model_dump=lambda **_: {
        'audio_base64': base64.b64encode(b'saved mp3').decode(),
        'alignment': {'characters': ['H', 'i'], 'character_start_times_seconds': [0, .1], 'character_end_times_seconds': [.1, .2]},
    })
    def run():
        return run_pipeline('user', str(sample), 'Hi', client=client, prepared_audio_path=sample,
                            output_dir=tmp_path/'outputs', log_dir=tmp_path/'logs')
    return client, run, tmp_path


def test_delete_only_current_voice_after_audio_and_timing_are_saved(speech_run):
    client, run, root = speech_run
    def delete(**kwargs):
        assert kwargs['voice_id'] == 'this-run-only'
        assert (root/'outputs/reference_speech.mp3').read_bytes() == b'saved mp3'
        assert json.loads((root/'outputs/reference_alignment.json').read_text())['words']
    client.voices.delete.side_effect = delete
    run()
    client.voices.delete.assert_called_once()
    client.voices.get_all.assert_not_called()
    assert json.loads((root/'logs/meta.json').read_text())['voice_cleanup_status'] == 'deleted'


@pytest.mark.parametrize('verification', [False, True])
def test_failure_still_deletes_created_voice_and_preserves_original_error(speech_run, verification):
    client, run, root = speech_run
    client.voices.ivc.create.return_value.requires_verification = verification
    client.text_to_speech.convert_with_timestamps.side_effect = ValueError('synthesis interrupted')
    with pytest.raises((ValueError, RuntimeError), match='verification|synthesis interrupted'):
        run()
    client.voices.delete.assert_called_once()
    assert client.voices.delete.call_args.kwargs['voice_id'] == 'this-run-only'
    assert json.loads((root/'logs/meta.json').read_text())['status'] == 'failed'
    if verification:
        client.text_to_speech.convert_with_timestamps.assert_not_called()


def test_clone_limit_failure_does_not_delete_existing_account_voices(speech_run):
    client, run, root = speech_run
    client.voices.ivc.create.side_effect = ApiError(status_code=400, body={'detail': {'status': 'voice_limit_reached'}})
    with pytest.raises(ApiError):
        run()
    client.voices.delete.assert_not_called()
    client.text_to_speech.convert_with_timestamps.assert_not_called()
    assert json.loads((root/'logs/meta.json').read_text())['voice_cleanup_status'] == 'not_created'


def test_transient_cleanup_failures_retry_and_keep_generated_audio(speech_run, monkeypatch):
    client, run, root = speech_run
    monkeypatch.setattr('backend.elevenlabs_tts.service.time.sleep', lambda _: None)
    client.voices.delete.side_effect = [httpx.ReadTimeout('timeout'), ApiError(status_code=503), None]
    run()
    report = json.loads((root/'logs/voice_cleanup.json').read_text())
    assert report['status'] == 'deleted'
    assert len(report['attempts']) == 3
    assert [entry['status'] for entry in report['attempts']] == ['failed', 'failed', 'deleted']
    assert (root/'outputs/reference_speech.mp3').read_bytes() == b'saved mp3'


@pytest.mark.parametrize('code, expected_attempts', [(403, 1), (429, 3)])
def test_cleanup_failure_is_logged_without_failing_successful_tts(speech_run, monkeypatch, code, expected_attempts):
    client, run, root = speech_run
    monkeypatch.setattr('backend.elevenlabs_tts.service.time.sleep', lambda _: None)
    client.voices.delete.side_effect = ApiError(status_code=code, body={'secret': 'must not be logged'})
    run()
    stats = json.loads((root/'logs/meta.json').read_text())
    assert stats['status'] == 'success'
    assert stats['voice_cleanup_status'] == 'failed'
    assert stats['voice_delete_requests'] == expected_attempts
    assert client.voices.delete.call_count == expected_attempts
    assert 'must not be logged' not in (root/'logs/voice_cleanup.json').read_text()


def test_missing_voice_on_delete_is_already_cleaned(speech_run):
    client, run, root = speech_run
    client.voices.delete.side_effect = ApiError(status_code=404)
    run()
    client.voices.delete.assert_called_once()
    assert json.loads((root/'logs/meta.json').read_text())['voice_cleanup_status'] == 'already_deleted'


def test_cleanup_failure_does_not_mask_tts_failure(speech_run):
    client, run, root = speech_run
    client.text_to_speech.convert_with_timestamps.side_effect = ValueError('original synthesis error')
    client.voices.delete.side_effect = ApiError(status_code=401)
    with pytest.raises(ValueError, match='original synthesis error'):
        run()
    stats = json.loads((root/'logs/meta.json').read_text())
    assert stats['status'] == 'failed'
    assert stats['error_type'] == 'ValueError'
    assert stats['voice_cleanup_status'] == 'failed'
