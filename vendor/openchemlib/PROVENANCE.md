# DoseWiki OpenChemLib fork provenance

This directory is a self-contained, repository-owned fork used by the DoseWiki molecule depiction editor.

## Imported baselines

- `openchemlib-js` version `9.23.0`
  - repository: `https://github.com/cheminfo/openchemlib-js`
  - commit: `d0157013aef3bb3e0057804491d4acc2192fe283`
  - tag: `v9.23.0`
- Java OpenChemLib source copied into that release
  - repository: `https://github.com/cheminfo/openchemlib`
  - commit: `94f77815728907829087ef350bf069ce241b54c1`

Imported on 2026-07-18. The upstream Git submodule and all nested Git metadata were deliberately omitted. The Java source required by the GWT build is checked in under this package's source tree.

## License

The imported source and binary artifacts are BSD-3-Clause licensed. Keep `LICENSE` with source distributions and include it with any redistributed binary package. Do not use the upstream project or contributor names to endorse DoseWiki.

## Ownership

DoseWiki owns its local modifications and build outputs. Upstream remains the author and copyright holder of the imported code. See `LOCAL_MODIFICATIONS.md` for the maintained delta.
