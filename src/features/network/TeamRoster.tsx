import { CheckCircle2, CircleDashed, Unplug } from "lucide-react";
import type { NetworkSessionView } from "@/session/protocol";
import styles from "./NetworkPages.module.css";

const roles = ["INSTRUCTOR", "COMMANDER", "ANALYST"] as const;

export function TeamRoster({
  roster,
  currentRole,
}: {
  roster: NetworkSessionView["roster"];
  currentRole: NetworkSessionView["role"];
}) {
  return (
    <ul className={styles.roster} aria-label="Session participants">
      {roles.map((role) => {
        const participant = roster.find((item) => item.role === role);
        const Icon = !participant
          ? CircleDashed
          : participant.connected
            ? CheckCircle2
            : Unplug;
        const state = !participant
          ? "WAITING"
          : participant.connected
            ? "CONNECTED"
            : "DISCONNECTED";
        return (
          <li className={styles.participant} key={role} data-state={state}>
            <div>
              <span className={styles.role}>
                {role}
                {role === currentRole ? " · you" : ""}
              </span>
              <strong>{participant?.name ?? "Not joined yet"}</strong>
            </div>
            <span className={styles.participantStatus}>
              <Icon size={14} aria-hidden="true" />
              {!participant
                ? "Waiting"
                : participant.connected
                  ? "Connected"
                  : "Disconnected"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
