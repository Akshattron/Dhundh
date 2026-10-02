import type { Intent } from "../../src/engine";

// Gate 1 anchors cover chronology and causal intents, not later scoring.
export const reportTimeline = [
  { id: "R01", issuedAtSec: 180, deliveredAtSec: 180, status: "DELIVERED" },
  { id: "R02", issuedAtSec: 300, deliveredAtSec: 300, status: "DELIVERED" },
  { id: "R03", issuedAtSec: 360, deliveredAtSec: 360, status: "DELIVERED" },
  { id: "R04", issuedAtSec: 480, deliveredAtSec: 480, status: "DELIVERED" },
  { id: "R08", issuedAtSec: 960, deliveredAtSec: 960, status: "DELIVERED" },
  { id: "R06", issuedAtSec: 960, deliveredAtSec: 1320, status: "DELIVERED" },
  { id: "R05", issuedAtSec: 1020, deliveredAtSec: 1020, status: "DELIVERED" },
  { id: "R10", issuedAtSec: 1200, deliveredAtSec: null, status: "DROPPED" },
  { id: "R09", issuedAtSec: 1260, deliveredAtSec: 1620, status: "DELIVERED" },
  { id: "R07", issuedAtSec: 1440, deliveredAtSec: 1440, status: "DELIVERED" },
  { id: "R11", issuedAtSec: 1500, deliveredAtSec: 1860, status: "DELIVERED" },
] as const;

const start: Intent = { type: "START", t: 0, role: "SOLO" };
const open = (reportId: string, minute: number): Intent => ({
  type: "OPEN_REPORT",
  t: minute * 60,
  role: "SOLO",
  reportId,
});
const estimate = (minute: number, p: number): Intent => ({
  type: "SET_ESTIMATE",
  t: minute * 60,
  role: "SOLO",
  hypothesisId: "north_pass",
  p,
});
const decide = (minute: number, actionId: string): Intent => ({
  type: "DECIDE",
  t: minute * 60,
  role: "SOLO",
  actionId,
  rationale: null,
});
const firstReports = (): Intent[] =>
  ["R01", "R02", "R03", "R04"].map((id) => open(id, 9));

export const pathIntents: Record<"A" | "B" | "C" | "D" | "E", Intent[]> = {
  A: [
    start,
    ...firstReports(),
    estimate(18, 0.8),
    open("R05", 18),
    open("R06", 22),
    { type: "VERIFY", t: 1320, role: "SOLO", assetId: "UAV_SORTIE" },
    open("R07", 24),
    open("V01", 28),
    estimate(29, 0.25),
    {
      type: "DECIDE",
      t: 1740,
      role: "SOLO",
      actionId: "GO_SOUTH",
      rationale: {
        text: "Rockfall report plus the sortie result outweigh the stale clear reports.",
        citedReportIds: ["R06", "V01"],
        tags: ["WEIGHED_CONTRADICTION", "AWAITED_VERIFICATION"],
      },
    },
  ],
  B: [
    start,
    ...firstReports(),
    open("R05", 18),
    open("R07", 24),
    estimate(25, 0.9),
    decide(26, "GO_NORTH"),
  ],
  C: [start, ...firstReports(), estimate(15, 0.95), decide(16, "GO_NORTH")],
  D: [
    start,
    open("R01", 3),
    open("R02", 5),
    open("R03", 6),
    open("R04", 8),
    open("R05", 17),
    open("R06", 22),
    open("R07", 24),
    estimate(27, 0.5),
    decide(28, "STAND_DOWN"),
  ],
  E: [start],
};

export const completionTimes = {
  A: 2160,
  B: 1860,
  C: 1260,
  D: 1860,
  E: 1980,
} as const;
