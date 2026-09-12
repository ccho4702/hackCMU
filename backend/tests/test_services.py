import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from backend.main import app
from backend.gemini_script.service import analyze_script
from backend.gemini_script.schemas import ScriptAnalysis
from backend.elevenlabs_tts.service import get_or_create_voice, generate_gt_speech
from backend.pipeline.service import process_recording


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_voice_cache_avoids_second_clone_and_preserves_labels(self):
        sample = self.root / 'sample.mp3'
        sample.write_bytes(b'sample')
        provider = Mock()
        provider.voices.ivc.create.return_value = SimpleNamespace(voice_id='voice-1', requires_verification=False)
        cache = self.root / 'cache.json'
        with patch.dict(os.environ, {'ELEVENLABS_API_KEY': 'test-only'}):
            for _ in range(2):
                self.assertEqual(get_or_create_voice('../user', str(sample), client=provider, cache_path=cache), 'voice-1')
        self.assertEqual(provider.voices.ivc.create.call_count, 1)
        self.assertEqual(provider.voices.ivc.create.call_args.kwargs['labels'], {})
        self.assertEqual(provider.voices.ivc.create.call_args.kwargs['request_options']['max_retries'], 0)
        self.assertNotIn('test-only', cache.read_text())
        self.assertNotIn('../user', cache.read_text())

    def test_tts_failure_preserves_previous_audio_and_removes_partial(self):
        provider = Mock()
        provider.text_to_speech.convert_with_timestamps.side_effect = RuntimeError("interrupted")
        out = self.root / 'audio.mp3'
        out.write_bytes(b'previous-success')
        with self.assertRaises(RuntimeError):
            generate_gt_speech('voice', 'Hello', str(out), client=provider)
        self.assertEqual(out.read_bytes(), b'previous-success')
        self.assertFalse(out.with_name('audio.mp3.part').exists())

    def test_script_video_uses_one_generation_and_validates_quoted_evidence(self):
        video = self.root / 'video.mp4'; video.write_bytes(b'video')
        provider = Mock()
        data = {'original_script': 'I has an idea.', 'issues': [{'original': 'I has', 'problem': '문법', 'suggestion': 'I have'}], 'improved_script': 'I have an idea.'}
        provider.models.generate_content.return_value = SimpleNamespace(text=json.dumps(data), usage_metadata=None)
        result = analyze_script(video_path=video, client=provider, log_dir=self.root/'logs')
        self.assertEqual(result.improved_script, 'I have an idea.')
        self.assertEqual(provider.models.generate_content.call_count, 1)
        self.assertEqual(len(provider.models.generate_content.call_args.kwargs['contents']), 2)
        data['issues'][0]['original'] = 'not in the recording'
        provider.models.generate_content.return_value.text = json.dumps(data)
        with self.assertRaises(ValueError):
            analyze_script(video_path=video, client=provider)

    def test_verification_required_does_not_create_duplicate_paid_voice(self):
        sample=self.root/'sample.mp3';sample.write_bytes(b'sample')
        provider=Mock()
        provider.voices.ivc.create.return_value=SimpleNamespace(voice_id='pending-voice',requires_verification=True)
        cache=self.root/'cache.json'
        with self.assertRaises(RuntimeError):
            get_or_create_voice('demo',str(sample),client=provider,cache_path=cache)
        self.assertEqual(get_or_create_voice('demo',str(sample),client=provider,cache_path=cache),'pending-voice')
        self.assertEqual(provider.voices.ivc.create.call_count,1)

    def test_pipeline_connects_two_gemini_stages_and_passes_revised_script_to_tts(self):
        run = self.root / ('a'*32)
        for name in ['inputs','intermediates','outputs','logs']:(run/name).mkdir(parents=True)
        source=run/'inputs/recording.mov'; source.write_bytes(b'original')
        improved=ScriptAnalysis(original_script='hello',issues=[],improved_script='Hello everyone.')
        def fake_video(path, output, *args, **kwargs):
            output.mkdir(parents=True)
            (output/'presentation-analysis-meta.json').write_text('{"attempt_count":1}')
            (output/'presentation-analysis.json').write_text(json.dumps({'nonverbal_feedback':[], 'vocal_feedback':[{'start_time':'00:01.000','end_time':'00:02.000','content':'Pause interrupts the phrase.'}]}))
            return 0
        def fake_tts(*args, **kwargs):
            (kwargs['output_dir']/'reference_speech.mp3').write_bytes(b'ID3test')
            kwargs['log_dir'].mkdir(parents=True)
            (kwargs['log_dir']/'meta.json').write_text('{"tts_requests":1,"clone_requests":0}')
        with patch('backend.pipeline.service.prepare_video', return_value=run/'intermediates/analysis-input.mp4'), \
             patch('backend.pipeline.service.extract_audio', return_value=str(run/'intermediates/voice_sample.mp3')), \
             patch('backend.pipeline.service.transcribe_audio', return_value={'text':'hello','language_code':'eng','words':[]}) as asr, \
             patch('backend.pipeline.service.video_duration', return_value=10), \
             patch('backend.pipeline.service.google_project', return_value='test'), \
             patch('backend.pipeline.service.gemini_session'), \
             patch('backend.pipeline.service.run_analysis', side_effect=fake_video) as visual, \
             patch('backend.pipeline.service.analyze_script', return_value=improved) as script, \
             patch('backend.pipeline.service.synthesize', side_effect=fake_tts) as speech:
            result=process_recording(source,'demo',tts_client=Mock(),language='ko')
        self.assertEqual(result['status'],'success')
        self.assertEqual(visual.call_count,1); self.assertEqual(script.call_count,1); self.assertEqual(speech.call_count,1)
        self.assertEqual(asr.call_count,1)
        self.assertEqual(result['language'], 'ko')
        for call in (visual, asr, script, speech):
            self.assertEqual(call.call_args.kwargs['language'], 'ko')
        self.assertEqual(script.call_args.kwargs['script'],'hello')
        self.assertNotIn('video_path',script.call_args.kwargs)
        self.assertEqual(speech.call_args.args[2], 'Hello everyone.')
        self.assertEqual(result['gemini_requests'], {'video':1,'script':1})
        self.assertTrue((run/'intermediates/original_script.txt').exists())
        self.assertEqual(json.loads((run/'outputs/nonverbal_feedback.json').read_text()), [])
        self.assertEqual(len(json.loads((run/'outputs/vocal_feedback.json').read_text())), 1)
        self.assertEqual(set(result['outputs']), {'nonverbal_feedback','vocal_feedback','script_feedback','improved_script','tts_audio','transcript'})

    def test_pipeline_failure_retains_completed_outputs_and_stage(self):
        run=self.root/('b'*32)
        for name in ['inputs','intermediates','outputs','logs']:(run/name).mkdir(parents=True)
        source=run/'inputs/recording.mov';source.write_bytes(b'original')
        with patch('backend.pipeline.service.prepare_video', side_effect=ValueError('invalid media')):
            with self.assertRaises(ValueError):process_recording(source,'demo')
        manifest=json.loads((run/'manifest.json').read_text())
        self.assertEqual((manifest['status'],manifest['stage']),('failed','prepare'))


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)

    def test_health_and_openapi(self):
        self.assertEqual(self.client.get('/api/health').json(), {'status':'ok'})
        self.assertIn('/api/pipeline', self.client.get('/openapi.json').json()['paths'])

    def test_blank_script_rejected_before_provider_request(self):
        with patch('backend.gemini_script.router.analyze_script') as call:
            self.assertEqual(self.client.post('/api/script/analyze',json={'script':'   '}).status_code,422)
            call.assert_not_called()

    def test_pipeline_missing_key_does_not_call_gemini(self):
        with patch('backend.pipeline.router.get_client', side_effect=RuntimeError('ELEVENLABS_API_KEY is not configured')), \
             patch('backend.pipeline.router.process_recording') as call:
            response=self.client.post('/api/pipeline',data={'user_id':'demo'},files={'file':('test.mov',b'video','video/quicktime')})
        self.assertEqual(response.status_code,503)
        call.assert_not_called()

    def test_non_media_upload_rejected(self):
        response=self.client.post('/api/video/analyze',files={'file':('secret.txt',b'test','text/plain')})
        self.assertEqual(response.status_code,415)

    def test_artifact_routes_do_not_serve_arbitrary_files(self):
        self.assertEqual(self.client.get('/api/runs/not-a-run').status_code,404)
        self.assertEqual(self.client.get('/api/runs/'+'a'*32+'/outputs/voice_cache.json').status_code,404)


if __name__=='__main__': unittest.main()
