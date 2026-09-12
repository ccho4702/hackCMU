import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from backend.main import app
from backend.elevenlabs_asr.service import transcribe_audio
from backend.common.logging import save_json


class AsrTests(unittest.TestCase):
    def test_transcription_preserves_fillers_and_logs_one_request(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);audio=root/'audio.mp3';audio.write_bytes(b'fake')
            client=Mock()
            client.speech_to_text.convert.return_value.model_dump.return_value={'text':'Um, hello.','language_code':'eng','words':[]}
            result=transcribe_audio(audio,client=client,log_dir=root/'logs')
            self.assertEqual(result['text'],'Um, hello.')
            self.assertEqual(client.speech_to_text.convert.call_count,1)
            self.assertFalse(client.speech_to_text.convert.call_args.kwargs['no_verbatim'])
            self.assertEqual(json.loads((root/'logs/meta.json').read_text())['asr_requests'],1)

    def test_silent_transcription_fails_and_records_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);audio=root/'audio.mp3';audio.write_bytes(b'fake')
            client=Mock()
            client.speech_to_text.convert.return_value.model_dump.return_value={'text':'  '}
            with self.assertRaises(ValueError):transcribe_audio(audio,client=client,log_dir=root/'logs')
            self.assertEqual(json.loads((root/'logs/meta.json').read_text())['status'],'failed')


class JobTests(unittest.TestCase):
    def test_job_submission_polling_and_partial_result_download(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ,{'ARTIFACTS_DIR':temp}):
            def process(source,*args,**kwargs):
                directory=source.parent.parent
                save_json(directory/'outputs/transcript.json',{'text':'Hello','words':[]})
                save_json(directory/'manifest.json',{'run_id':directory.name,'status':'failed','stage':'script_analysis',
                    'error_message':'Script failed','outputs':{'transcript':'transcript.json'},'source_filename':source.name})
            with patch('backend.pipeline.router.get_client',return_value=Mock()), patch('backend.pipeline.router.process_recording',side_effect=process), TestClient(app) as client:
                created=client.post('/api/pipeline',data={'user_id':'test'},files={'file':('take.webm',b'recording','video/webm')})
                self.assertEqual(created.status_code,202)
                self.assertEqual(created.json()['status'],'queued')
                run_id=created.json()['run_id']
                state=client.get(f'/api/runs/{run_id}').json()
                self.assertEqual(state['status'],'failed')
                self.assertEqual(state['results']['transcript']['text'],'Hello')
                self.assertEqual(client.get(state['outputs']['transcript']).json()['text'],'Hello')
                self.assertEqual(client.get(state['original_video_url']).content,b'recording')


if __name__=='__main__':unittest.main()
