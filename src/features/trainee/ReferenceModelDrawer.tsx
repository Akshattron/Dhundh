import { useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import type { ReferenceModelView } from "@/engine/view";
import styles from "./ReferenceModelDrawer.module.css";

function minutes(seconds: number): string {
  return `${seconds / 60} min`;
}

export function ReferenceModelDrawer({ model }: { model: ReferenceModelView }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = dialog.current;
    const focusable = () =>
      panel?.querySelectorAll<HTMLElement>(
        'button, a[href], summary, [tabindex]:not([tabindex="-1"])',
      ) ?? [];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = [...focusable()];
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previous instanceof HTMLElement &&
        previous !== document.body &&
        previous.isConnected
      ) {
        previous.focus();
      } else trigger.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={15} aria-hidden="true" /> Reference model
      </button>
      {open && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={dialog}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-model-title"
            aria-describedby="reference-model-disclosure"
          >
            <header className={styles.header}>
              <div>
                <p className={styles.kicker}>Transparent normative baseline</p>
                <h2 id="reference-model-title">Reference model</h2>
              </div>
              <button
                className={styles.close}
                type="button"
                aria-label="Close reference model"
                onClick={() => setOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <p id="reference-model-disclosure" className={styles.disclosure}>
              The reference model is a transparent normative baseline for this
              synthetic scenario. It is not real doctrine and is not claimed to
              be universally correct. Decisions use only information available
              at their decision-time cut. Verification results use dedicated
              tasking links and are not affected by routine channel degradation.
            </p>
            <div className={styles.sections}>
              <details open>
                <summary>Belief fusion</summary>
                <p>
                  Start with prior log-odds <code>L₀ = ln(π / (1 − π))</code>.
                  Each non-neutral report contributes{" "}
                  <code>LLR = stance × ln(A / (1 − A))</code>, where effective
                  accuracy is <code>A = 0.5 + (ρ − 0.5) × e^(−age/τ) × m</code>.
                  Age is measured at evaluation time, not delivery time.
                </p>
                <p>
                  Reports sharing an evidence group and hypothesis count once:
                  agreeing reports retain the largest absolute contribution;
                  conflicting reports retain the most recently issued, then
                  higher sequence. Posterior log-odds clamp to ±
                  {model.parameters.llrClamp}.
                </p>
                <ul>
                  {model.hypotheses.map((hypothesis) => (
                    <li key={hypothesis.id}>
                      {hypothesis.label}: prior{" "}
                      {(hypothesis.prior * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
                <ul>
                  {Object.entries(model.tauSec).map(([channel, tau]) => (
                    <li key={channel}>
                      {channel} age-decay time constant: {minutes(tau ?? 0)}
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Entropy and Fog Index</summary>
                <p>
                  Binary entropy is{" "}
                  <code>H(p) = −p log₂(p) − (1−p) log₂(1−p)</code>, with
                  H(0)=H(1)=0. Fog Index is the mean entropy across all
                  hypotheses; the console displays it as a percentage.
                </p>
              </details>
              <details>
                <summary>Contradiction</summary>
                <p>
                  Positive and negative evidence masses are the sums of positive
                  LLRs and absolute negative LLRs. The contradiction index is{" "}
                  <code>1 − |W+ − W−| / (W+ + W−)</code> when total mass is at
                  least 0.2 nats. A flag also requires index ≥{" "}
                  {model.parameters.contradictionThreshold} and both sides ≥{" "}
                  {model.parameters.contradictionMinNats} nats.
                </p>
              </details>
              <details>
                <summary>Decision quality and regret</summary>
                <p>
                  Expected utility sums authored payoffs over independent joint
                  truth assignments, less time cost when applicable. Regret is
                  the best expected utility minus the chosen action’s expected
                  utility. Decision Quality is 1 − regret / maximum regret, or 1
                  when maximum regret is zero. Display ties use a{" "}
                  {model.parameters.tieEpsilon}-point tolerance; the
                  mathematical maximum remains unchanged.
                </p>
              </details>
              <details>
                <summary>Verification value</summary>
                <p>
                  EVPI is the expected value with perfect information minus
                  current best expected utility. EVSI is the expected best
                  utility after the verification result, evaluated at the same
                  time. Net VOI = EVSI − waiting cost − asset cost. Verification
                  is feasible only when result time is strictly before the
                  decision deadline.
                </p>
              </details>
              <details>
                <summary>Training Score weights</summary>
                <ul>
                  <li>
                    Decision Quality: {model.scoreWeights.decisionQuality * 100}
                    %
                  </li>
                  <li>
                    Information Utilization:{" "}
                    {model.scoreWeights.informationUtilization * 100}%
                  </li>
                  <li>Outcome: {model.scoreWeights.outcome * 100}%</li>
                  <li>Timeliness: {model.scoreWeights.timeliness * 100}%</li>
                  <li>
                    Verification Efficiency:{" "}
                    {model.scoreWeights.verificationEfficiency * 100}%
                  </li>
                  <li>
                    Calibration Alignment:{" "}
                    {model.scoreWeights.calibration * 100}%
                  </li>
                </ul>
              </details>
              <details>
                <summary>Model limitations</summary>
                <ul>
                  {model.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
                <p>
                  A single-session calibration result is noisy. No learning
                  transfer is validated or claimed.
                </p>
              </details>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
