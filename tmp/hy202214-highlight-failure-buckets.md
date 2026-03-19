# HY202214 Highlight Failure Buckets

## Clear Reference/Evidence Mismatch

- `GCT_GCT29` at `seed-report-cards.gct_vs_ecc_gct.json:210`
  - Item description is `GCT29`, but the ECC-side reference is `ECC HK_GCT26_20240524.docx`.
  - This is a direct wrong-file mapping, not a highlight precision problem.

- `GCT_GCT35` at `seed-report-cards.gct_vs_ecc_gct.json:739`
  - Tender-side evidence comes from `I-HY_2022_14-SCT-APP-E-00` and is about `Contingency sums, provisional sums and forecast total of the Prices`.
  - ECC-side evidence is `GCT 35` on `National Security and Public Interest`.
  - One side is clearly mapped to the wrong clause/document.

- `NTT_NTTC2` at `seed-report-cards.ntt_vs_ecc_ntt.json:118`
  - Tender-side evidence is a TOC/index fragment from `I-HY_2022_14-NTT-00`, not the actual `NTT C2` clause text.
  - The sibling item `NTT_NTTC2~2` at `seed-report-cards.ntt_vs_ecc_ntt.json:440` uses `I-HY_2022_14-PS-01-00` and contains the real clause.

- `NTT_NTTA21` at `seed-report-cards.ntt_vs_ecc_ntt.json:3`
  - Tender-side evidence is garbled TOC/index text from `I-HY_2022_14-NTT-00`.
  - It does not contain substantive `NTT A21 Estimates for Tender Price Index` clause content.

## Likely Wrong Evidence Span Or Corrupted Pairing

- `GCT_GCT34` at `seed-report-cards.gct_vs_ecc_gct.json:3`
  - The item description is `GCT34`, but the ECC-side excerpt starts mid-paragraph on an unrelated fragment.
  - This looks more like a bad evidence slice than a pure highlighter miss.

- `GCT_GCT34~2` at `seed-report-cards.gct_vs_ecc_gct.json:647`
  - Both sides are index-like excerpts, and the reasoning drifts away from `GCT34`.
  - The whole `GCT34` item family should be treated as noisy/corrupted.

- `NTT_NTTA5` at `seed-report-cards.ntt_vs_ecc_ntt.json:210`
  - ECC-side evidence is only a trailing sentence about `e-TS(WC)`.
  - This suggests the standard-side quote span is incomplete or mis-cut.

- `NTT_NTTA11` at `seed-report-cards.ntt_vs_ecc_ntt.json:279`
  - Tender-side evidence is the general formula-approach clause.
  - ECC-side evidence is a training-score subpart.
  - File name may be correct, but the paired excerpt is likely from the wrong section.

- `NTT_NTTA6` at `seed-report-cards.ntt_vs_ecc_ntt.json:325`
  - ECC-side evidence is only a placeholder tail (`* Delete as appropriate`, `# Update the figure as appropriate`).
  - This is more consistent with a bad extracted span than with a highlight engine failure.

## Highest-Value Reference Fixes

- Fix `NTT_NTTC2` first.
  - Replace the tender-side source with `I-HY_2022_14-PS-01-00` like `NTT_NTTC2~2`.
  - This is the only case in the current set with an already-proven working sibling.

- Fix `GCT_GCT29` next.
  - Replace `ECC HK_GCT26_20240524.docx` with the actual `GCT29` source.

- Fix `GCT_GCT35`.
  - Remap the tender-side evidence to the actual `GCT35` clause/form source instead of the contingency-sums text.

- Fix `NTT_NTTA21`.
  - Remap away from the `NTT` TOC/index source to the actual ETPI clause location.

## What This Does Not Mean

- Most entries in `tmp/hy202214-reference-evidence-fix-list.md` are still missing-ECC-PDF coverage issues, not confirmed wrong mappings.
- Those missing references matter for coverage, but they are a different problem from the small set of raw items above that are clearly mis-paired.
