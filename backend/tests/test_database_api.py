import io
import json
import wave

import mongomock
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from backend import db, media
from backend.main import app
from backend.summary import compute_summary


@pytest.fixture
def api(monkeypatch, tmp_path):
    store = mongomock.MongoClient().hackcmu
    monkeypatch.setattr(db, 'db', lambda: store)
    monkeypatch.setattr(media, 'DATA_DIR', tmp_path)
    client = TestClient(app)
    return client, store


def login(client, email='alice@example.com'):
    result = client.post('/api/auth/login', json={'name': 'Alice', 'email': email})
    assert result.status_code == 200
    return {'X-User-Id': result.json()['user_id']}


def wav():
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(16000)
        stream.writeframes(b'\0\0' * 1600)
    return output.getvalue()


def reference(client, headers, script=None):
    return client.post('/api/references', headers=headers,
        data={'question': 'Introduce yourself', 'script': json.dumps(script or [{'id':'s0','text':'Hello everyone.'}])},
        files={'audio': ('tts.wav', wav(), 'audio/wav')})


def test_login_reuses_email_and_normalizes_identity(api):
    client, store = api
    first = login(client, 'ALICE@example.com ')
    assert login(client) == first
    assert store.users.count_documents({}) == 1
    assert client.post('/api/auth/login', json={'name':'', 'email':'invalid'}).status_code == 400


def test_reference_upload_decodes_media_and_enforces_ownership(api):
    client, store = api
    owner = login(client)
    response = reference(client, owner)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['script'][0]['duration_sec'] == .1
    assert client.get(data['script'][0]['audio_url']).status_code == 200
    assert client.get('/api/references/'+data['id'], headers=login(client,'bob@example.com')).status_code == 404
    assert len(client.get('/api/references', headers=owner).json()['references']) == 1


@pytest.mark.parametrize('item', [
    {'id':'../escape','text':'Hello'}, {'id':'s0','text':42},
    {'id':'s0','text':'Hello', 'words':[{'text':'Hello', 't0':1, 't1':0}]},
])
def test_invalid_reference_does_not_persist(api, item):
    client, store = api
    assert reference(client, login(client), [item]).status_code == 400
    assert store.references.count_documents({}) == 0


def test_same_reference_trial_ranking_and_delete_ownership(api):
    client, store = api
    owner = login(client)
    ref = reference(client, owner).json()['id']
    trials = []
    for score in [.4, .8]:
        created = client.post('/api/trials', headers=owner,
            data={'question':'Introduce yourself', 'kind':'shadow', 'reference_id':ref})
        assert created.status_code == 200, created.text
        tid = created.json()['id']; trials.append(tid)
        store.trials.update_one({'_id':ObjectId(tid)}, {'$set':{'summary':{'overall':score}}})
    ranked = client.get('/api/trials', headers=owner, params={'reference_id':ref}).json()
    assert ranked['best_trial_id'] == trials[1]
    # An unfiltered list must never rank unlike GT references against one another.
    assert client.get('/api/trials', headers=owner).json()['best_trial_id'] is None
    assert client.get('/api/trials?limit=-1', headers=owner).status_code == 422
    assert client.delete('/api/trials/'+trials[0], headers=login(client,'bob@example.com')).status_code == 404
    assert client.delete('/api/trials/'+trials[0], headers=owner).status_code == 200
    assert client.get('/api/trials/'+trials[0], headers=owner).status_code == 404


def test_media_cannot_serve_secrets_or_escape_storage(api, tmp_path):
    client, _ = api
    (tmp_path/'private.json').write_text('{"secret":true}')
    assert client.get('/api/media/private.json').status_code == 404
    with pytest.raises(Exception) as error:
        media.abs_path('../outside.wav')
    assert error.value.status_code == 400


def test_unconfigured_database_does_not_break_coaching(monkeypatch):
    monkeypatch.delenv('MONGODB_URI', raising=False)
    db.client.cache_clear()
    client = TestClient(app)
    assert client.get('/api/health').status_code == 200
    assert client.get('/api/db/health').json()['status'] == 'disabled'
    assert client.post('/api/auth/login', json={'name':'Alice','email':'alice@example.com'}).status_code == 503


def test_database_failure_does_not_expose_connection_credentials(monkeypatch):
    def fail():
        raise ServerSelectionTimeoutError('mongodb://username:secret@private-host')
    monkeypatch.setattr(db, 'users', fail)
    response = TestClient(app).post('/api/auth/login', json={'name':'Alice','email':'alice@example.com'})
    assert response.status_code == 503
    assert 'secret' not in response.text and 'private-host' not in response.text


def test_unreliable_sentences_do_not_affect_summary():
    assert compute_summary([{'status':'unreliable','pronunciation_score':1}]) is None


def test_guest_mode_creates_unique_profiles_without_email_input(api):
    client, store = api
    store.users.create_index('email', unique=True)
    first = client.post('/api/auth/guest')
    second = client.post('/api/auth/guest')
    assert first.status_code == second.status_code == 201
    a, b = first.json(), second.json()
    assert a['is_guest'] and a['name'] == 'Guest' and a['email'] is None
    assert a['user_id'] != b['user_id']
    assert store.users.count_documents({'is_guest': True}) == 2
    me = client.get('/api/me', headers={'X-User-Id': a['user_id']})
    assert me.status_code == 200 and me.json()['email'] is None


def test_guest_histories_keep_existing_ownership_checks(api):
    client, store = api
    a = client.post('/api/auth/guest').json()['user_id']
    b = client.post('/api/auth/guest').json()['user_id']
    owned = reference(client, {'X-User-Id': a}).json()
    assert client.get('/api/references/'+owned['id'], headers={'X-User-Id': b}).status_code == 404
    assert client.get('/api/references/'+owned['id'], headers=login(client)).status_code == 404
    assert len(client.get('/api/references', headers={'X-User-Id': a}).json()['references']) == 1
    assert client.get('/api/references', headers={'X-User-Id': b}).json()['references'] == []
