"""Guard the Cloud billing path and keep API keys out of logged URLs."""
import os
from unittest.mock import Mock, patch

import google.auth.credentials
import httpx
import pytest
from google import genai
from google.genai import types

from backend.common import gemini


@pytest.fixture(autouse=True)
def isolated_auth(monkeypatch):
    for name in ('GEMINI_AUTH_MODE', 'VERTEX_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_JSON'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'test-project')


def test_key_mode_does_not_load_adc_or_use_ai_studio(monkeypatch):
    monkeypatch.setenv('GEMINI_AUTH_MODE', 'vertex_api_key')
    monkeypatch.setenv('VERTEX_API_KEY', 'test-key')
    with patch.object(gemini.google.auth, 'default', side_effect=AssertionError('ADC used')):
        with gemini.session() as session:
            assert session.headers['x-goog-api-key'] == 'test-key'
            assert 'Authorization' not in session.headers
        with patch.object(gemini.genai, 'Client') as factory:
            gemini.client()
            assert factory.call_args.kwargs['vertexai'] is True
            assert factory.call_args.kwargs['api_key'] == 'test-key'
            assert 'project' not in factory.call_args.kwargs
    endpoint = gemini.generate_endpoint('test-project', 'gemini-test')
    assert endpoint == 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-test:generateContent'
    assert 'test-key' not in endpoint


def test_adc_explicit_credentials_override_ambient_ai_studio_key(monkeypatch):
    monkeypatch.setenv('GOOGLE_API_KEY', 'unrelated-ai-studio-key')
    credentials = Mock()
    with patch.object(gemini, 'credentials', return_value=credentials), patch.object(gemini.genai, 'Client') as factory:
        gemini.client()
        assert factory.call_args.kwargs['credentials'] is credentials
        assert factory.call_args.kwargs['vertexai'] is True
        assert factory.call_args.kwargs['project'] == 'test-project'
        assert 'api_key' not in factory.call_args.kwargs
    assert '/projects/test-project/' in gemini.generate_endpoint('test-project', 'gemini-test')


def test_missing_key_fails_without_adc_fallback(monkeypatch):
    monkeypatch.setenv('GEMINI_AUTH_MODE', 'vertex_api_key')
    with patch.object(gemini.google.auth, 'default', side_effect=AssertionError('ADC used')):
        with pytest.raises(RuntimeError, match='VERTEX_API_KEY'):
            gemini.client()
        with pytest.raises(RuntimeError, match='VERTEX_API_KEY'):
            with gemini.session():
                pass


def test_invalid_mode_cannot_switch_to_developer_api(monkeypatch):
    monkeypatch.setenv('GEMINI_AUTH_MODE', 'ai_studio')
    with pytest.raises(ValueError):
        gemini.client()


def test_real_sdk_key_routing_ignores_ambient_project(monkeypatch):
    monkeypatch.setenv('GEMINI_AUTH_MODE', 'vertex_api_key')
    monkeypatch.setenv('VERTEX_API_KEY', 'test-key')
    observed = []
    def receive(request):
        observed.append(request)
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]})
    real_factory = genai.Client
    def create(**kwargs):
        kwargs['http_options'].client_args = {'transport': httpx.MockTransport(receive)}
        return real_factory(**kwargs)
    with patch.object(gemini.genai, 'Client', side_effect=create), patch.object(gemini.google.auth, 'default', side_effect=AssertionError('ADC used')):
        with gemini.client() as client:
            assert client.models.generate_content(model='gemini-test', contents='Hello').text == 'ok'
    request = observed[0]
    assert request.url.host == 'aiplatform.googleapis.com'
    assert '/projects/' not in request.url.path
    assert request.headers['x-goog-api-key'] == 'test-key'
    assert 'authorization' not in request.headers


def test_inline_service_account_never_uses_local_user_login(monkeypatch):
    import json
    info = {"type": "service_account", "project_id": "test-project",
            "client_email": "backend@test-project.iam.gserviceaccount.com",
            "private_key": "private-test-material", "token_uri": "https://oauth2.googleapis.com/token"}
    monkeypatch.setenv('GOOGLE_SERVICE_ACCOUNT_JSON', json.dumps(info))
    with patch.object(gemini.google.auth, 'default', side_effect=AssertionError('User ADC used')), \
         patch.object(gemini.service_account.Credentials, 'from_service_account_info') as factory:
        assert gemini.credentials() == factory.return_value
        assert factory.call_args.args[0] == info
        assert gemini.google_project() == 'test-project'


@pytest.mark.parametrize('change', [
    {"project_id": "wrong-project"}, {"token_uri": "https://example.com/token"},
    {"type": "authorized_user"}, {"private_key": ""},
])
def test_invalid_inline_identity_fails_without_user_login_fallback(monkeypatch, change):
    import json
    info = {"type": "service_account", "project_id": "test-project",
            "client_email": "backend@test-project.iam.gserviceaccount.com",
            "private_key": "secret-test-material", "token_uri": "https://oauth2.googleapis.com/token"}
    info.update(change)
    monkeypatch.setenv('GOOGLE_SERVICE_ACCOUNT_JSON', json.dumps(info))
    with patch.object(gemini.google.auth, 'default', side_effect=AssertionError('User ADC used')):
        with pytest.raises(RuntimeError) as error:
            gemini.credentials()
    assert 'secret-test-material' not in str(error.value)
