# Remaining props 31–48

- Generated 18 chains from `remaining-chains.json`, preserving exact metadata IDs (including 50036) and names.
- Exported 85 unique `voxel_32_<id>.glb` files, 18 `voxel-chainNN.blend` files, and per-chain manifests.
- Added `scripts/blender-voxel-remaining-props.py`; Blender generation asserts valid palette indices before export.
- Verification: `node scripts/check-remaining.cjs 31 48` passed for all chains; final export check confirmed 18 chains / 85 models.
