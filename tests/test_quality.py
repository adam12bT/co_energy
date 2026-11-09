"""Regression cases for leakage and ambiguity checks."""
import sys
import unittest
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from coenergy.quality import duplicate_summary, fingerprints


class QualityChecks(unittest.TestCase):
    def test_repeated_power_is_not_a_duplicate_input(self):
        temperature = np.array([[25., 26.], [25., 27.]])
        power = np.ones((2, 2))
        self.assertEqual(duplicate_summary(fingerprints(power))["excess_rows"], 1)
        self.assertEqual(duplicate_summary(fingerprints(temperature, power))["excess_rows"], 0)

    def test_rounding_can_create_input_label_ambiguity(self):
        temperature = torch.tensor([[25.001, 26.001], [25.002, 26.002]])
        power = np.ones((2, 2))
        targets = np.array([[100., 20.], [150., 20.]])
        self.assertEqual(duplicate_summary(fingerprints(temperature.numpy(), power))["excess_rows"], 0)
        result = duplicate_summary(fingerprints(temperature.round(decimals=2).numpy(), power), targets)
        self.assertEqual(result["excess_rows"], 1)
        self.assertEqual(result["groups_with_target_difference_above_numerical_tolerance"], 1)
        self.assertEqual(result["max_target_spread"], [50., 0.])

    def test_exact_clones_and_signed_zero(self):
        keys = fingerprints(np.array([[0., 2.], [-0., 2.], [0., 2.]]))
        result = duplicate_summary(keys, np.full((3, 2), 100.))
        self.assertEqual(result["excess_rows"], 2)
        self.assertEqual(result["participating_rows"], 3)
        self.assertEqual(result["groups_with_any_target_difference"], 0)


if __name__ == "__main__":
    unittest.main()
