import {
  Check,
  CircleSlash,
  Mountain,
  Network,
  Radio,
  TriangleAlert,
  Wind,
} from "lucide-react";
import type { ChannelId } from "@/engine/types";
import type { TraineeView } from "@/engine/view";
import { formatAge } from "@/utils/format";
import styles from "./ChannelHealthStrip.module.css";

const icons = { LAND: Mountain, AIR: Wind, CYBER: Network, EW: Radio };
const states = {
  HEALTHY: { label: "Healthy", icon: Check },
  DEGRADED: { label: "Degraded", icon: TriangleAlert },
  DOWN: { label: "Unavailable", icon: CircleSlash },
};

export function ChannelIcon({
  channel,
  size = 16,
}: {
  channel: ChannelId;
  size?: number;
}) {
  const Icon = icons[channel];
  return <Icon size={size} aria-hidden="true" />;
}

export function ChannelHealthStrip({
  channels,
  nowSec,
  compact = false,
}: {
  channels: TraineeView["channels"];
  nowSec: number;
  compact?: boolean;
}) {
  return (
    <section
      className={`${styles.strip} ${compact ? styles.compact : ""}`}
      aria-label="Information channels"
    >
      {channels.map((channel) => {
        const state = states[channel.health];
        const StateIcon = state.icon;
        return (
          <div
            className={styles.channel}
            data-channel={channel.id}
            data-health={channel.health}
            key={channel.id}
          >
            <span className={styles.identity}>
              <ChannelIcon channel={channel.id} />
              <strong>{channel.id}</strong>
            </span>
            <span className={styles.state}>
              <StateIcon size={13} aria-hidden="true" />
              {state.label}
            </span>
            <span className={styles.source}>
              {channel.visible
                ? channel.sourceLabel
                : "Role-restricted reports"}
            </span>
            <span className={styles.contact}>
              {!channel.visible
                ? "Health only"
                : channel.lastDeliveredAtSec === null
                  ? "Awaiting first receipt"
                  : `Last receipt ${formatAge(nowSec - channel.lastDeliveredAtSec)}`}
            </span>
          </div>
        );
      })}
    </section>
  );
}
