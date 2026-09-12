import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from backend.main import app
from backend.elevenlabs_tts.alignment import character_to_words, validate_words
from backend.elevenlabs_tts.service import generate_gt_speech
from backend.practice.service import scoring_text, reference_timing, align_existing_reference, json_safe


class TimingTests(unittest.TestCase):
    def test_character_alignment_groups_words_and_retains_punctuation(self):
        text='Hi, there!'
        alignment={'characters':list(text),'character_start_times_seconds':[i*.1 for i in range(len(text))], 'character_end_times_seconds':[(i+1)*.1 for i in range(len(text))]}
        result=character_to_words(alignment)
        self.assertEqual(result['words'][0], {'text':'Hi,','t0':0,'t1':.30000000000000004})
        self.assertEqual(result['words'][1]['text'],'there!')
        self.assertAlmostEqual(result['words'][1]['t0'],.4)
        with self.assertRaises(ValueError):character_to_words({**alignment,'character_end_times_seconds':[]})
        with self.assertRaises(ValueError):validate_words([{'text':'test','t0':float('nan'),'t1':1}])

    def test_tts_returns_audio_and_timing_in_one_request(self):
        with tempfile.TemporaryDirectory() as temp:
            audio=b'ID3-test';text='Hi there'
            provider=Mock()
            provider.text_to_speech.convert_with_timestamps.return_value.model_dump.return_value={
                'audio_base64':base64.b64encode(audio).decode(),
                'normalized_alignment':{'characters':list(text),'character_start_times_seconds':[i*.1 for i in range(len(text))], 'character_end_times_seconds':[(i+1)*.1 for i in range(len(text))]}}
            out=Path(temp)/'reference_speech.mp3'
            generate_gt_speech('voice',text,str(out),client=provider)
            self.assertEqual(out.read_bytes(),audio)
            result=json.loads((Path(temp)/'reference_alignment.json').read_text())
            self.assertEqual(result['audio_sha256'],hashlib.sha256(audio).hexdigest())
            self.assertEqual(len(result['words']),2)
            self.assertEqual(provider.text_to_speech.convert_with_timestamps.call_count,1)
            provider.text_to_speech.convert.assert_not_called()

    def test_reference_alignment_is_cached_and_bound_to_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'outputs').mkdir()
            audio=root/'outputs/reference_speech.mp3';audio.write_bytes(b'ID3')
            (root/'outputs/improved_script.txt').write_text('Hi there')
            client=Mock();client.forced_alignment.create.return_value.model_dump.return_value={'words':[{'text':'Hi','start':0,'end':.3},{'text':'there','start':.4,'end':1}]}
            align_existing_reference(root,client=client);align_existing_reference(root,client=client)
            self.assertEqual(client.forced_alignment.create.call_count,1)
            audio.write_bytes(b'changed')
            self.assertIsNone(reference_timing(root))

    def test_hyphenated_numbers_never_create_ctc_blank_targets(self):
        from backend.scoring.shadow_score import normalize_words
        import torchaudio
        _, normalized = normalize_words("twenty-seven well-trained")
        tokens = torchaudio.pipelines.MMS_FA.get_tokenizer()(normalized)
        self.assertTrue(tokens)
        self.assertNotIn(0, [token for word in tokens for token in word])

    def test_numbers_are_spoken_and_unsupported_scripts_are_explicit(self):
        text=scoring_text('It is 2:27 AM and 60% is done.')
        self.assertIn('two twenty-seven',text)
        self.assertIn('sixty percent',text)
        self.assertNotRegex(text,r'\d')
        with self.assertRaises(ValueError):scoring_text('안녕하세요 여러분')
        self.assertIsNone(json_safe({'score':float('nan')})['score'])


class PracticeApiTests(unittest.TestCase):
    def test_trials_use_the_parent_reference_and_keep_history(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ,{'ARTIFACTS_DIR':temp}):
            run_id='c'*32;root=Path(temp)/'runs'/run_id;(root/'outputs').mkdir(parents=True)
            reference={'script':'Hi there','scoring_text':'Hi there','fingerprint':'fixed-reference','duration_seconds':2,'max_trial_seconds':30}
            def evaluate(run,trial,source,ref):
                self.assertEqual(run.resolve(),root.resolve());self.assertEqual(ref['fingerprint'],'fixed-reference')
                manifest=json.loads((trial/'manifest.json').read_text())
                manifest.update(status='complete',stage='complete',score={'status':'unreliable','reason':'No speech'})
                (trial/'manifest.json').write_text(json.dumps(manifest))
            with patch('backend.practice.router.prepare_reference',return_value=reference), patch('backend.practice.router.reference_timing',return_value=None), patch('backend.practice.router.start_warmup'), patch('backend.practice.router.evaluate_trial',side_effect=evaluate), TestClient(app) as client:
                ids=[]
                for _ in range(2):
                    response=client.post(f'/api/runs/{run_id}/trials',files={'file':('trial.webm',b'audio','audio/webm')})
                    self.assertEqual(response.status_code,202);ids.append(response.json()['trial_id'])
                self.assertNotEqual(*ids)
                data=client.get(f'/api/runs/{run_id}/practice').json()
                self.assertEqual(data['trial_count'],2)
                self.assertEqual([t['trial_number'] for t in data['trials']],[2,1])
                self.assertEqual(client.get(f'/api/runs/{run_id}/trials/{ids[0]}').json()['score']['status'],'unreliable')
                self.assertEqual(client.get('/api/runs/'+'d'*32+f'/trials/{ids[0]}').status_code,404)
                self.assertEqual(client.post(f'/api/runs/{run_id}/trials',files={'file':('x.txt',b'x')}).status_code,415)
                self.assertEqual(client.post(f'/api/runs/{run_id}/trials',files={'file':('x.webm',b'')}).status_code,400)


if __name__=='__main__':unittest.main()
