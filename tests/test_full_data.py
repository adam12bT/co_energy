"""Verify compact shard semantics at the model's specified input precision."""
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from coenergy.full_data import load_shard


class FullDataChecks(unittest.TestCase):
    def test_delta_and_packed_power_reconstruct_without_extra_quantization(self):
        rng=np.random.default_rng(4)
        q=(2500+np.cumsum(rng.integers(-2,3,size=(5,480)),axis=1)).astype(np.int16)
        power=rng.integers(0,2,size=(5,480)).astype(np.uint8)
        targets=np.ones((5,6),dtype=np.float32)
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            np.savez_compressed(folder/'batch_1.npz',initial=q[:,0],delta=np.diff(q,axis=1).astype(np.int8),
                                power=np.packbits(power,axis=1),binary_power=np.array(True),targets=targets)
            x,y=load_shard(folder,1)
        np.testing.assert_array_equal(x[:,0].numpy(),q.astype(np.float32)/100)
        np.testing.assert_array_equal(x[:,1].numpy(),power.astype(np.float32)*7000)
        np.testing.assert_array_equal(y.numpy(),targets)

    def test_nonbinary_power_fallback_preserves_actual_values(self):
        power=np.full((2,480),135.7,dtype=np.float32)
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            np.savez_compressed(folder/'batch_1.npz',initial=np.array([2500,2500],dtype=np.int16),
                                delta=np.zeros((2,479),dtype=np.int8),power=power,
                                binary_power=np.array(False),targets=np.ones((2,6),dtype=np.float32))
            x,_=load_shard(folder,1)
        np.testing.assert_array_equal(x[:,1].numpy(),power)


if __name__=='__main__':unittest.main()
