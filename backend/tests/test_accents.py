import base64
import json
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.common.accent import ACCENT_TAGS, validate_accent
from backend.elevenlabs_tts.service import generate_gt_speech, run_pipeline
from backend.gemini_video.service import run_analysis


def aligned(text):
    return {'characters':list(text),'character_start_times_seconds':[i*.03 for i in range(len(text))],
            'character_end_times_seconds':[(i+1)*.03 for i in range(len(text))]}


@pytest.mark.parametrize('accent', list(ACCENT_TAGS))
def test_selected_accent_uses_v3_and_same_voice_without_control_tags_in_word_timing(tmp_path, accent):
    provider=Mock();tag=ACCENT_TAGS[accent]
    provider.text_to_speech.convert_with_timestamps.return_value.model_dump.return_value={
        'audio_base64':base64.b64encode(b'test audio').decode(), 'alignment':aligned(tag+' Hello world.')}
    generate_gt_speech('same-cloned-voice','Hello world.',str(tmp_path/'out.mp3'),client=provider,language='en',accent=accent)
    args=provider.text_to_speech.convert_with_timestamps.call_args.kwargs
    assert args['voice_id']=='same-cloned-voice'
    assert args['model_id']=='eleven_v3'
    assert args['text']==tag+' Hello world.'
    assert args['voice_settings']['stability']==.5
    output=json.loads((tmp_path/'reference_alignment.json').read_text())
    assert [w['text'] for w in output['words']]==['Hello','world.']
    assert output['words'][0]['t0']==pytest.approx((len(tag)+1)*.03)
    assert output['requested_accent']==accent


def test_already_clean_alignment_and_original_voice_model_are_preserved(tmp_path, monkeypatch):
    monkeypatch.setenv('ELEVENLABS_TTS_MODEL','eleven_multilingual_v2')
    provider=Mock()
    provider.text_to_speech.convert_with_timestamps.return_value.model_dump.return_value={
        'audio_base64':base64.b64encode(b'test audio').decode(),'normalized_alignment':aligned('Hello world.')}
    generate_gt_speech('voice','Hello world.',str(tmp_path/'out.mp3'),client=provider,language='en')
    assert provider.text_to_speech.convert_with_timestamps.call_args.kwargs['text']=='Hello world.'
    assert provider.text_to_speech.convert_with_timestamps.call_args.kwargs['model_id']=='eleven_multilingual_v2'
    generate_gt_speech('voice','Hello world.',str(tmp_path/'out.mp3'),client=provider,language='en',accent='british')
    assert json.loads((tmp_path/'reference_alignment.json').read_text())['words'][0]['text']=='Hello'


@pytest.mark.parametrize('language,accent',[('ko','british'),(None,'american'),('en','invalid')])
def test_invalid_accent_is_rejected_before_paid_pipeline_requests(language, accent):
    client=TestClient(app)
    with patch('backend.pipeline.router.get_client') as provider:
        data={'user_id':'demo','accent':accent}
        if language:data['language']=language
        response=client.post('/api/pipeline',data=data,files={'file':('video.mp4',b'video','video/mp4')})
        assert response.status_code==422
        provider.assert_not_called()


def test_accent_prompt_limit_fails_before_cloning(tmp_path):
    source=tmp_path/'sample.wav';source.write_bytes(b'audio')
    with patch('backend.elevenlabs_tts.service.get_or_create_voice') as clone:
        with pytest.raises(ValueError,match='5,000'):
            run_pipeline('demo',str(source),'x'*5000,client=Mock(),language='en',accent='indian')
        clone.assert_not_called()


def test_gemini_vocal_analysis_uses_the_same_user_selected_accent(tmp_path):
    video=tmp_path/'sample.mp4';video.write_bytes(b'video')
    payload={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps({'nonverbal_feedback':[],'vocal_feedback':[]})}]}}]}
    http=Mock();http.post.return_value=Mock(status_code=200,ok=True,text=json.dumps(payload),json=lambda:payload)
    assert run_analysis(video,tmp_path/'logs','project','model',4,http,max_attempts=1,language='en',accent='australian')==0
    prompt=http.post.call_args.kwargs['json']['contents'][0]['parts'][-1]['text']
    assert 'Australian English' in prompt
    assert 'For vocal_feedback only' in prompt
    assert 'not a speaking defect' in prompt
    meta=json.loads((tmp_path/'logs/presentation-analysis-meta.json').read_text())
    assert meta['target_accent']=='australian'
    assert http.post.call_count==1
