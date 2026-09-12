import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.gemini_script.service import analyze_script


@pytest.mark.parametrize('style', ['presentation','interview','formal','informal','friend','pitch'])
@pytest.mark.parametrize('language,text', [('en','I built a prototype to help people practice.'),('ko','저는 발표 연습을 돕는 시제품을 만들었습니다.')])
def test_style_is_sent_to_gemini_without_changing_the_original(style, language, text, tmp_path):
    provider=Mock()
    provider.models.generate_content.return_value=SimpleNamespace(
        text=json.dumps({'original_script':text,'issues':[],'improved_script':text}),usage_metadata=None)
    result=analyze_script(text,client=provider,language=language,script_style=style,log_dir=tmp_path)
    prompt=provider.models.generate_content.call_args.kwargs['config'].system_instruction
    assert f'SELECTED SCRIPT SCENARIO: {style}' in prompt
    assert 'Keep original_script verbatim' in prompt
    assert result.original_script==text
    assert json.loads((tmp_path/'meta.json').read_text())['script_style']==style
    assert provider.models.generate_content.call_count==1


def test_unknown_style_fails_before_generating_or_starting_pipeline():
    client=TestClient(app)
    with patch('backend.pipeline.router.get_client') as provider:
        response=client.post('/api/pipeline',data={'user_id':'demo','script_style':'invent achievements'},
                            files={'file':('video.mp4',b'video','video/mp4')})
        assert response.status_code==422
        provider.assert_not_called()
    with patch('backend.gemini_script.router.analyze_script') as generate:
        assert client.post('/api/script/analyze',json={'script':'Hello everyone','script_style':'unknown'}).status_code==422
        generate.assert_not_called()


def test_direct_script_route_passes_selected_scenario():
    with patch('backend.gemini_script.router.analyze_script') as generate:
        generate.return_value={'original_script':'Hello everyone','issues':[],'improved_script':'Hello everyone'}
        response=TestClient(app).post('/api/script/analyze',json={'script':'Hello everyone','script_style':'interview'})
        assert response.status_code==200
        assert generate.call_args.kwargs['script_style']=='interview'
