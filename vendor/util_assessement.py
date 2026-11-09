import dataclasses
import glob
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Union
from types import ModuleType

import torch

datatype = torch.float32


@dataclass
class ToSaveSimul:
    HLC: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    CDT: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    indoor_temperature: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    indoor_U: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    solicitation: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    solicitation_field_names: List[str] = field(default_factory=list)
    Hb: torch.Tensor = field(default_factory=lambda: torch.empty(0, dtype=datatype))
    Hb_labels: List[str] = field(default_factory=list)


def create_mock_package():
    """Register a mock package so pickle can resolve thermal_dynamics_sim.*"""
    main_module = ModuleType('thermal_dynamics_sim')
    main_module.__package__ = 'thermal_dynamics_sim'
    main_module.__path__ = []
    main_module.ToSaveSimul = ToSaveSimul

    utils_module = ModuleType('thermal_dynamics_sim.utils')
    utils_module.__package__ = 'thermal_dynamics_sim.utils'
    utils_module.__path__ = []
    utils_module.ToSaveSimul = ToSaveSimul

    data_to_save_module = ModuleType('thermal_dynamics_sim.utils.data_to_save')
    data_to_save_module.__package__ = 'thermal_dynamics_sim.utils'
    data_to_save_module.ToSaveSimul = ToSaveSimul

    # This is the part that was missing
    sys.modules['thermal_dynamics_sim'] = main_module
    sys.modules['thermal_dynamics_sim.utils'] = utils_module
    sys.modules['thermal_dynamics_sim.utils.data_to_save'] = data_to_save_module

    # Attribute access on parent packages
    main_module.utils = utils_module
    utils_module.data_to_save = data_to_save_module

    return main_module, utils_module, data_to_save_module


create_mock_package()  

def combine_batches(batches: List[ToSaveSimul]) -> ToSaveSimul:
    """
    Combine multiple ToSaveSimul batches into a single object.

    Args:
        batches: List of ToSaveSimul objects to combine

    Returns:
        ToSaveSimul: Combined simulation data
    """
    if not batches:
        return ToSaveSimul()

    combined = ToSaveSimul()

    # Combine all tensor data
    combined.indoor_temperature = torch.cat([batch.indoor_temperature for batch in batches], dim=0)
    combined.indoor_U = torch.cat([batch.indoor_U for batch in batches], dim=0)
    combined.HLC = torch.cat([batch.HLC for batch in batches], dim=0)
    combined.Hb = torch.cat([batch.Hb for batch in batches], dim=0)
    combined.CDT = torch.cat([batch.CDT for batch in batches], dim=0)
    combined.solicitation = torch.cat([batch.solicitation for batch in batches], dim=0)
    combined.Hb_labels = batches[0].Hb_labels

    # Use field names from the first batch (should be consistent across all batches)
    combined.solicitation_field_names = batches[0].solicitation_field_names

    return combined


def load_single_batch(file_path: Union[str, Path]) -> ToSaveSimul:
    """
    Load a single batch file containing simulation data.

    Args:
        file_path: Path to the .pt file containing ToSaveSimul data

    Returns:
        ToSaveSimul: Loaded simulation data
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        # Fix for PyTorch 2.6+ - set weights_only=False
        data = torch.load(file_path, weights_only=False)
        if not isinstance(data, ToSaveSimul):
            raise ValueError(f"Expected ToSaveSimul object, got {type(data)}")
        return data
    except Exception as e:
        raise RuntimeError(f"Failed to load {file_path}: {e}")


def load_simulation_data(folder_path: Path) -> ToSaveSimul:
    """
    Load all simulation batch files from a folder and combine them into a single ToSaveSimul object.

    Args:
        folder_path: Path to simulation output folder containing batch_*.pt files

    Returns:
        ToSaveSimul: Combined simulation data from all batches
    """
    folder_path = Path(folder_path)
    if not folder_path.exists():
        raise FileNotFoundError(f"Folder not found: {folder_path}")

    # Find all batch files
    batch_files = sorted(glob.glob(str(folder_path / "batch_*.pt")))

    if not batch_files:
        raise FileNotFoundError(f"No batch_*.pt files found in {folder_path}")

    # print(f"Found {len(batch_files)} batch files")

    # Load all batches
    batches = []
    for file_path in batch_files:
        batch_data = load_single_batch(file_path)
        batches.append(batch_data)

    # Combine all batches into one ToSaveSimul object
    return combine_batches(batches)



