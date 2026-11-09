"""Leakage and physical-constraint regression checks for the pilot."""
import sys
import unittest
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from coenergy.pilot import CausalBlock, Scaling, grouped_split, similarity_groups


class PilotChecks(unittest.TestCase):
    def test_scaling_ignores_heldout_distribution_and_outputs_obey_physics(self):
        x = torch.arange(24.).reshape(3, 2, 4)
        y = torch.tensor([[3., 1., 2., 4., 5., 6.], [7., 3., 4., 8., 9., 10.], [1e6] * 6])
        scaling = Scaling.fit(x[:2], y[:2])
        self.assertTrue(torch.allclose(scaling.log_mean, y[:2].log().mean(0)))
        self.assertFalse(torch.allclose(scaling.log_mean, y.log().mean(0)))
        predicted = scaling.decode(torch.randn(8, 5, requires_grad=True))
        self.assertTrue((predicted > 0).all())
        self.assertTrue(torch.allclose(predicted[:, 0], predicted[:, 1:3].sum(1)))
        scaling.loss(predicted, y[:1].expand(8, -1)).backward()

    def test_similar_inputs_are_kept_together_but_shared_power_is_not_enough(self):
        x = torch.tensor([[[25., 26., 27.], [0., 0., 0.]],
                          [[25., 26.005, 27.005], [0., 0., 0.]],
                          [[25., 29., 35.], [0., 0., 0.]],
                          [[25., 26., 27.], [1., 1., 1.]]])
        groups, _ = similarity_groups(x)
        self.assertEqual(groups[0], groups[1])
        self.assertNotEqual(groups[0], groups[2])
        self.assertNotEqual(groups[0], groups[3])
        all_groups = np.repeat(np.arange(60), 2)
        zero = np.repeat(np.arange(60) % 2 == 0, 2)
        split = grouped_split(all_groups, zero, 42)
        for a, b in (("train", "validation"), ("train", "test"), ("validation", "test")):
            self.assertFalse(set(all_groups[split[a]]) & set(all_groups[split[b]]))
        self.assertEqual(len(np.unique(np.concatenate(list(split.values())))), 120)

    def test_causal_block_cannot_see_future_samples(self):
        block = CausalBlock(2, 8, 4).eval()
        x = torch.randn(2, 2, 40)
        changed = x.clone()
        changed[:, :, 20:] += 100
        with torch.no_grad():
            self.assertTrue(torch.allclose(block(x)[:, :, :20], block(changed)[:, :, :20], atol=1e-6))


if __name__ == "__main__":
    unittest.main()
