import base64
import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.common.language import resolve_language
from backend.gemini_script.service import analyze_script
from backend.gemini_video.service import run_analysis
from backend.elevenlabs_asr.service import transcribe_audio
from backend.elevenlabs_tts.service import generate_gt_speech


@pytest.mark.parametrize('language,name', [('en','English'),('ko','Korean')])
def test_script_language_controls_feedback_and_revision(tmp_path, language, name):
    provider = Mock()
    script = 'Hello everyone.' if language == 'en' else '여러분 안녕하세요.'
    provider.models.generate_content.return_value = SimpleNamespace(
        text=json.dumps({'original_script':script,'issues':[],'improved_script':script}),usage_metadata=None)
    assert analyze_script(script, client=provider, language=language, log_dir=tmp_path).original_script == script
    prompt = provider.models.generate_content.call_args.kwargs['config'].system_instruction
    assert f'feedback in {name}' in prompt
    assert f'Write improved_script\nin {name}' in prompt
    assert json.loads((tmp_path/'meta.json').read_text())['language'] == language


@pytest.mark.parametrize('language,provider_code', [('en','eng'),('ko','kor'),(None,None)])
def test_asr_language_hint(tmp_path, language, provider_code):
    audio = tmp_path/'sample.wav'; audio.write_bytes(b'fake audio')
    provider = Mock()
    provider.speech_to_text.convert.return_value.model_dump.return_value = {'text':'test speech','words':[],'language_code':provider_code}
    transcribe_audio(audio, client=provider, log_dir=tmp_path/'logs', language=language)
    assert provider.speech_to_text.convert.call_args.kwargs.get('language_code') == provider_code


@pytest.mark.parametrize('model,expected', [('eleven_multilingual_v2',None),('eleven_flash_v2_5','ko')])
def test_tts_does_not_send_unsupported_language_parameter(tmp_path, monkeypatch, model, expected):
    monkeypatch.setenv('ELEVENLABS_TTS_MODEL', model)
    provider = Mock()
    provider.text_to_speech.convert_with_timestamps.return_value.model_dump.return_value = {
        'audio_base64':base64.b64encode(b'test mp3').decode(),
        'alignment':{'characters':['안','녕'],'character_start_times_seconds':[0,.2],'character_end_times_seconds':[.2,.5]},
    }
    generate_gt_speech('voice','안녕',str(tmp_path/'test.mp3'),client=provider,language='ko')
    assert provider.text_to_speech.convert_with_timestamps.call_args.kwargs.get('language_code') == expected
    words = json.loads((tmp_path/'reference_alignment.json').read_text())['words']
    assert words[0]['text'] == '안녕'


def test_video_prompt_language_and_log(tmp_path):
    video = tmp_path/'video.mp4';video.write_bytes(b'test video')
    reply = Mock(status_code=200,ok=True)
    reply.json.return_value = {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'[]'}]}}]}
    reply.text = json.dumps(reply.json.return_value)
    session = Mock();session.post.return_value = reply
    assert run_analysis(video,tmp_path/'logs','project','model',4,session,max_attempts=1,language='en') == 0
    prompt = session.post.call_args.kwargs['json']['contents'][0]['parts'][-1]['text']
    assert 'in English' in prompt and 'Korean' not in prompt
    assert json.loads((tmp_path/'logs/presentation-analysis-meta.json').read_text())['language'] == 'en'


def test_language_default_and_override(monkeypatch):
    assert resolve_language() is None
    monkeypatch.setenv('PRESENTATION_LANGUAGE','ko')
    assert resolve_language() is None  # A server env value must not override user selection.
    assert resolve_language('en') == 'en'
    with pytest.raises(ValueError):resolve_language('fr')


@pytest.mark.parametrize('route', ['/api/pipeline','/api/video/analyze','/api/script/analyze-video','/api/asr/transcribe','/api/tts/generate'])
def test_invalid_language_rejected_before_providers(route):
    with patch('backend.pipeline.router.get_client') as client:
        response=TestClient(app).post(route, data={'language':'fr','user_id':'demo','improved_script':'hello'},
            files={'file':('video.mp4',b'video','video/mp4')})
        assert response.status_code == 422
        client.assert_not_called()


def test_script_api_forwards_language_and_exposes_limits():
    client=TestClient(app)
    with patch('backend.gemini_script.router.analyze_script') as analyze:
        analyze.return_value={'original_script':'안녕','issues':[],'improved_script':'안녕하세요'}
        assert client.post('/api/script/analyze',json={'script':'안녕','language':'ko'}).status_code == 200
        assert analyze.call_args.kwargs['language']=='ko'
        assert client.post('/api/script/analyze',json={'script':'안녕','language':'fr'}).status_code == 422
        assert analyze.call_count == 1
    assert {x['code']:x['practice_scoring'] for x in client.get('/api/languages').json()['supported']} == {'en':True,'ko':False}
