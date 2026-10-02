# DHUNDH reference-model assumptions

Gate 1 preserves these approved model assumptions in the validated synthetic
flagship and deterministic engine foundation. Belief fusion, scoring, AAR, and
learning-outcome validation are not implemented at this gate.

- Hypotheses are binary: true or false.
- Scenario content, entities, reliabilities, utilities, and geography are
  synthetic authoring parameters, not empirical measurements or real doctrine.
- The reference model assumes conditional independence between evidence groups;
  reports from one underlying observation must not be counted independently.
  Joint-state evaluation also treats hypotheses as independent.
- Decision quality will be evaluated against the reference belief at the deciding
  role's commitment cut, separately from realized outcome. The reference belief
  is a transparent normative baseline for fictional scenarios, not a claim of
  real-world correctness.
- No validation study of learning transfer is claimed.
- Single-decision calibration and Brier metrics are noisy. Aggregation over many
  sessions is needed for meaningful diagnostics, and those diagnostics do not
  demonstrate training effectiveness.

Authority: master specification Sections 3.4, 22-24, and 32. None of these
assumptions constitutes an implementation or acceptance result.
