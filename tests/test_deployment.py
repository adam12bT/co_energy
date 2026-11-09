"""Deployment artefacts must retain exact examples and exclude local/raw inputs."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from prepare_hf_bundle import prepare


class DeploymentChecks(unittest.TestCase):
    def test_exported_examples_have_recorded_hash_and_all_batches(self):
        path=ROOT/'deployment/assets/examples.json'
        provenance=json.loads((ROOT/'deployment/assets/examples_provenance.json').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),provenance['sha256'])
        rows=json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(len(rows),provenance['examples'])
        self.assertEqual({c['batch_id'] for c in rows.values()},set(range(1,21)))
        for identifier,c in rows.items():
            self.assertEqual(identifier,f"batch-{c['batch_id']}-row-{c['row_index']}")
            self.assertEqual(len(c['temperature']),480);self.assertEqual(len(c['power']),480)
            self.assertEqual(len(c['ground_truth']),6)
            self.assertIn(c['partition'],['train','validation','test','set_aside'])

    @unittest.skipUnless((ROOT/'frontend/dist/index.html').is_file(),'Build the frontend before testing the complete deployment context.')
    def test_bundle_is_allowlisted_and_refuses_nonempty_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'space';manifest=prepare(output)
            names=set(manifest['files'])
            self.assertIn('Dockerfile',names);self.assertIn('app/deployment/assets/release.json',names)
            self.assertIn('app/reports/full_training/tcn_best.pt',names)
            self.assertIn('app/frontend/dist/index.html',names)
            self.assertFalse(any('/node_modules/' in n or '/data/raw/' in n or '/data/processed/' in n or n.endswith('/.env') for n in names))
            self.assertTrue((output/'app/frontend/public/data/audit-data.json').is_file())
            self.assertFalse((output/'app/reports/full_training/split.npz').exists())
            self.assertFalse(any(n.endswith(('.ipynb','.npz','.log')) for n in names))
            self.assertFalse(any(n.endswith(('design.css','guide.css','project-guide.tsx')) for n in names))
            for name,expected in manifest['files'].items():
                self.assertEqual(hashlib.sha256((output/name).read_bytes()).hexdigest(),expected['sha256'])
            with self.assertRaises(ValueError):prepare(output)


if __name__=='__main__':unittest.main()
