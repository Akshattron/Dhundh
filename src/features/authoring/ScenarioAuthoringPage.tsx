import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import {
  AUTHORING_MAX_CHARACTERS,
  validateScenarioDraft,
  type DraftValidation,
} from "@/engine/authoring";
import {
  createLocalSession,
  type LocalSessionClient,
} from "@/session/LocalSessionClient";
import { useSessionView } from "@/session/useSessionView";
import flagship from "@/scenarios/kestrel-relief-corridor.json";
import harbour from "@/scenarios/harbour-flood-response.json";
import { downloadFile } from "@/utils/download";
import { formatClock, formatPercent } from "@/utils/format";
import styles from "./ScenarioAuthoringPage.module.css";

const templates = [flagship, harbour];
const initialText = JSON.stringify(flagship, null, 2);
const validationDelayMs = 300;

function ScenarioPreview({ client }: { client: LocalSessionClient }) {
  const view = useSessionView(client);
  if (!view) return null;
  const primary = view.hypotheses.find((hypothesis) => hypothesis.primary);
  const probability = primary
    ? view.belief?.perHypothesis[primary.id]?.p
    : undefined;
  const next = client.getNextScheduledEventAtSec();
  return (
    <section
      className={styles.panel}
      aria-label="Isolated scenario preview"
      data-testid="authoring-preview"
    >
      <h2>Isolated local preview</h2>
      <ScenarioBadge />
      <p>
        Real LocalSessionClient, seed 0, authored difficulty and timings, no
        mutation. This preview never replaces your active exercise or writes
        session history. Unanswered decisions time out normally.
      </p>
      <p>
        <strong data-testid="preview-clock">{formatClock(view.nowSec)}</strong>{" "}
        · {view.phase} · {view.reports.length} delivered reports
      </p>
      <div className={styles.controls}>
        {view.phase === "IDLE" && (
          <Button onClick={() => client.dispatch({ type: "START" })}>
            Start preview
          </Button>
        )}
        {view.phase === "RUNNING" && (
          <Button onClick={() => client.dispatch({ type: "PAUSE" })}>
            Pause preview
          </Button>
        )}
        {view.phase === "PAUSED" && (
          <Button onClick={() => client.dispatch({ type: "RESUME" })}>
            Resume preview
          </Button>
        )}
        <Button
          disabled={
            next === null || !["RUNNING", "CONSEQUENCE"].includes(view.phase)
          }
          onClick={() => {
            if (next !== null) client.advanceToSeconds(next);
          }}
        >
          Next preview event
        </Button>
        <Button onClick={() => client.dispatch({ type: "RESET" })}>
          Reset preview
        </Button>
      </div>
      {view.engineError && <p role="alert">{view.engineError.message}</p>}
      <dl className={styles.summary}>
        <div>
          <dt>Fog</dt>
          <dd>
            {view.belief
              ? formatPercent(view.belief.fogIndex, 1)
              : "Aid withheld"}
          </dd>
        </div>
        <div>
          <dt>{primary?.label ?? "Primary belief"}</dt>
          <dd>
            {probability === undefined
              ? "Aid withheld"
              : formatPercent(probability, 1)}
          </dd>
        </div>
        <div>
          <dt>Decision</dt>
          <dd>
            {view.decisionPoint
              ? `${view.decisionPoint.id} · ${view.decisionPoint.status}`
              : "None"}
          </dd>
        </div>
      </dl>
      <p>
        {view.channels
          .filter((channel) => channel.visible)
          .map((channel) => `${channel.id}: ${channel.health}`)
          .join(" · ")}
      </p>
      <ul className={styles.reports}>
        {view.reports.slice(0, 6).map((report) => (
          <li key={report.id}>
            <strong>
              {formatClock(report.deliveredAtSec)} · {report.id}
            </strong>{" "}
            {report.claim}
          </li>
        ))}
      </ul>
      <p>
        Latest six delivered reports from the trainee projection. Hidden truth
        and instructor diagnostics are not shown.
      </p>
    </section>
  );
}

export default function ScenarioAuthoringPage() {
  const [document, setDocument] = useState({ text: initialText, revision: 0 });
  const [templateIndex, setTemplateIndex] = useState(0);
  const [resetText, setResetText] = useState(initialText);
  const [validation, setValidation] = useState<{
    revision: number;
    result: DraftValidation;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationFailure, setValidationFailure] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState(
    "Drafts stay in this editor. Export before leaving.",
  );
  const [preview, setPreview] = useState<LocalSessionClient | null>(null);
  const [importing, setImporting] = useState(false);
  const importRequest = useRef(0);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const report =
    validation?.revision === document.revision ? validation.result : null;
  const validate = useCallback(() => {
    try {
      setValidation({
        revision: document.revision,
        result: validateScenarioDraft(document.text),
      });
      setValidationFailure(null);
    } catch (cause) {
      setValidation(null);
      setValidationFailure(
        `Validation could not finish: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }, [document]);

  useEffect(() => {
    const timeout = window.setTimeout(validate, validationDelayMs);
    return () => window.clearTimeout(timeout);
  }, [validate]);
  useEffect(() => () => preview?.dispose(), [preview]);
  useEffect(
    () => () => {
      importRequest.current += 1;
    },
    [],
  );

  const replaceDraft = (text: string, message: string) => {
    importRequest.current += 1;
    setImporting(false);
    preview?.dispose();
    setPreview(null);
    setDocument((previous) => ({ text, revision: previous.revision + 1 }));
    setError(null);
    setValidationFailure(null);
    setStatus(message);
  };
  const startPreview = () => {
    if (!report?.previewReady || !report.scenario) {
      setError(
        "Validate the current draft and resolve readiness issues before previewing.",
      );
      return;
    }
    let next: LocalSessionClient | null = null;
    try {
      next = createLocalSession(report.scenario, {
        seed: 0,
        difficultyLevel: report.scenario.meta.difficulty,
        aidMode: "ALWAYS",
        speedSecPerMin: 4,
        authoredPreview: true,
      });
      next.dispatch({ type: "START" });
      if (next.getSnapshot().engineError)
        throw new Error(next.getSnapshot().engineError?.message);
      preview?.dispose();
      setPreview(next);
      setError(null);
      setStatus("Isolated preview is running. Editing the draft stops it.");
    } catch (cause) {
      next?.dispose();
      setError(
        `Preview failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };
  const importFile = async (file: File) => {
    const request = ++importRequest.current;
    setImporting(true);
    try {
      if (file.size > AUTHORING_MAX_CHARACTERS * 4)
        throw new Error("File exceeds the 800,000 byte import limit.");
      const text = await file.text();
      if (request !== importRequest.current) return;
      replaceDraft(text, `Imported ${file.name}. Validate before previewing.`);
      setResetText(text);
    } catch (cause) {
      if (request === importRequest.current)
        setError(
          `Import failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
    } finally {
      if (request === importRequest.current) setImporting(false);
    }
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error(
          "Clipboard unavailable. Select the draft and copy with your keyboard.",
        );
      await navigator.clipboard.writeText(document.text);
      setError(null);
      setStatus("Exact minute-based draft copied.");
    } catch (cause) {
      setError(
        `Copy failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      draftRef.current?.focus();
      draftRef.current?.select();
    }
  };
  const exportDraft = () => {
    if (!report?.scenario) {
      setError(
        "Fix schema and runtime invariant errors before exporting a scenario.",
      );
      return;
    }
    try {
      downloadFile(
        `${report.scenario.meta.id}.json`,
        document.text,
        "application/json",
      );
      setError(null);
      setStatus(
        "Exact minute-based draft exported. Bundled scenarios were not changed.",
      );
    } catch (cause) {
      setError(
        `Export failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };
  return (
    <article className={styles.page}>
      <div className={styles.heading}>
        <div>
          <Link to="/scenarios">Scenario library</Link>
          <h1>Scenario authoring</h1>
        </div>
        <ScenarioBadge />
      </div>
      <p className={styles.disclosure}>
        Synthetic training scenario editor. Do not enter real-world operational
        or classified content.
      </p>
      <p>
        Edit minute-based JSON. Schema and runtime validation run after a short
        typing pause; training-readiness checks reuse the deterministic mutation
        gate. No code is executed and no bundled files are overwritten.
      </p>
      <div className={styles.controls}>
        <label>
          Template{" "}
          <select
            value={templateIndex}
            onChange={(event) => setTemplateIndex(Number(event.target.value))}
          >
            {templates.map((template, index) => (
              <option key={template.meta.id} value={index}>
                {template.meta.title}
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => {
            const template = templates[templateIndex];
            if (!template) {
              setError(
                "Select an available synthetic template before reloading.",
              );
              return;
            }
            const text = JSON.stringify(template, null, 2);
            replaceDraft(
              text,
              "Bundled template reloaded as an editable copy.",
            );
            setResetText(text);
          }}
        >
          Reload template
        </Button>
        <label className={styles.fileInput}>
          Import JSON{" "}
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Import scenario JSON"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
      </div>
      <div className={styles.workspace}>
        <section className={styles.panel} aria-label="Scenario JSON editor">
          <label htmlFor="scenario-draft">
            <strong>Scenario JSON draft</strong>
          </label>
          <textarea
            id="scenario-draft"
            ref={draftRef}
            value={document.text}
            spellCheck={false}
            aria-describedby="draft-hint"
            onChange={(event) =>
              replaceDraft(
                event.target.value,
                "Draft changed; any previous preview was stopped. Validate and preview again.",
              )
            }
          />
          <p id="draft-hint">
            {document.text.length.toLocaleString()} /{" "}
            {AUTHORING_MAX_CHARACTERS.toLocaleString()} characters. Normalized
            seconds and automatic restores are never written back into this
            draft.
          </p>
          <div className={styles.controls}>
            <Button onClick={validate}>Validate now</Button>
            <Button
              onClick={() =>
                replaceDraft(
                  resetText,
                  "Draft reset to the last loaded template or import.",
                )
              }
            >
              Reset draft
            </Button>
            <Button onClick={() => void copy()}>Copy JSON</Button>
            <Button onClick={exportDraft} disabled={!report?.scenario}>
              Export JSON
            </Button>
            <Button
              variant="primary"
              onClick={startPreview}
              disabled={!report?.previewReady}
            >
              Preview scenario
            </Button>
          </div>
        </section>
        <section className={styles.panel} aria-label="Scenario validation">
          <h2>Validation and readiness</h2>
          <p role="status" data-testid="authoring-validation-status">
            {validationFailure && !report
              ? "Validation failed; repair the draft or reset."
              : !report
                ? "Validating current draft..."
                : report.previewReady
                  ? "Ready for isolated preview."
                  : report.scenario
                    ? "Loader-valid; training readiness is blocked."
                    : "Validation needs attention."}
          </p>
          {report && (
            <>
              <ul className={styles.checks}>
                {report.checks.map((check) => (
                  <li key={check.name}>
                    <span>{check.name}</span>
                    <strong data-status={check.status}>{check.status}</strong>
                  </li>
                ))}
              </ul>
              {report.issues.length > 0 && (
                <div className={styles.errors}>
                  <h3>Actionable issues</h3>
                  <ol>
                    {report.issues.slice(0, 20).map((issue, index) => (
                      <li key={index}>
                        <code>{issue.path}</code>: {issue.message}
                      </li>
                    ))}
                  </ol>
                  {report.issues.length > 20 && (
                    <p>
                      Showing the first 20 of {report.issues.length} issues. Fix
                      these and validate again.
                    </p>
                  )}
                </div>
              )}
              {report.scenario && (
                <>
                  <h3>Validated draft summary</h3>
                  <p>
                    <strong>{report.scenario.meta.title}</strong> · version{" "}
                    {report.scenario.meta.version} · {report.hash}
                  </p>
                  <p>
                    {report.scenario.hypotheses.length} hypotheses ·{" "}
                    {report.scenario.reports.length} reports ·{" "}
                    {report.scenario.decisionPoints.length} decisions ·{" "}
                    {report.scenario.assets.length} assets
                  </p>
                  <p>
                    Hypotheses:{" "}
                    {report.scenario.hypotheses
                      .map((hypothesis) => hypothesis.label)
                      .join("; ")}
                  </p>
                  <p>
                    Channels:{" "}
                    {report.scenario.channels
                      .map((channel) => channel.id)
                      .join(", ")}{" "}
                    · {report.scenario.events.length} normalized events,
                    including automatic restores
                  </p>
                  <p>
                    Difficulty {report.scenario.meta.difficulty} · horizon{" "}
                    {formatClock(report.scenario.meta.durationSec)} · utility
                    and consequence coverage complete
                  </p>
                  {report.scenario.decisionPoints.map((point) => (
                    <p key={point.id}>
                      {point.id} · {point.title}: {formatClock(point.openSec)}{" "}
                      to {formatClock(point.closeSec)} (close exclusive),{" "}
                      {point.actions.length} actions.
                    </p>
                  ))}
                  {report.readiness?.decisions.map((decision) => (
                    <p key={decision.id}>
                      {decision.id}: contradiction{" "}
                      {decision.contradictionAtSec === null
                        ? "unreachable"
                        : `reachable at ${formatClock(decision.contradictionAtSec)}`}
                      ; verification{" "}
                      {decision.verificationAtSec === null
                        ? "unavailable"
                        : `${decision.verificationAssetId} feasible at ${formatClock(decision.verificationAtSec)}`}
                      .
                    </p>
                  ))}
                </>
              )}
            </>
          )}
          <details>
            <summary>Editor limits and readiness assumptions</summary>
            <p>
              At most 6 hypotheses, 4 channels, 64 reports, 128 authored events,
              12 assets, 16 inject presets, 4 decisions, 8 actions per decision,
              and 64 rules per utility/consequence table. Decision close is at
              most 120 minutes; horizon, report/event times, and
              asset/consequence delays at most 180 minutes.
            </p>
            <p>
              Readiness is assessed on the existing whole-minute grid, with all
              locally visible evidence and no discretionary actions.
              Schema-valid JSON can still fail this stricter training gate. The
              preview is temporary, uses the exact authored difficulty/timings,
              and stops on edit, replacement, or leaving this page.
            </p>
          </details>
        </section>
      </div>
      {error && (
        <p className={styles.errors} role="alert">
          {error}
        </p>
      )}
      {validationFailure && (
        <p className={styles.errors} role="alert">
          {validationFailure}
        </p>
      )}
      <p role="status">
        {status}
        {importing ? " Reading selected file..." : ""}
      </p>
      {preview && <ScenarioPreview client={preview} />}
    </article>
  );
}
