import type {
  ChannelId,
  ChannelRuntime,
  ScenarioEvent,
  SimSeconds,
} from "./types";

function healthyChannel(id: ChannelId): ChannelRuntime {
  return {
    id,
    mode: "HEALTHY",
    health: "HEALTHY",
    extraDelaySec: 0,
    healthMultiplier: 1,
    untilSec: null,
    note: null,
    lastDeliveredAtSec: null,
  };
}

export function createChannels(): Record<ChannelId, ChannelRuntime> {
  return {
    LAND: healthyChannel("LAND"),
    AIR: healthyChannel("AIR"),
    CYBER: healthyChannel("CYBER"),
    EW: healthyChannel("EW"),
  };
}

export function degradeChannel(
  channel: ChannelRuntime,
  event: Extract<ScenarioEvent, { kind: "CHANNEL_DEGRADE" }>,
): ChannelRuntime {
  if (
    event.channel !== channel.id ||
    (event.mode === "DELAY" && event.extraDelaySec === undefined) ||
    (event.mode === "NOISE" && event.healthMultiplier === undefined)
  ) {
    throw new Error("Invalid channel degradation parameters");
  }
  return {
    ...channel,
    mode: event.mode,
    health: event.mode === "DROPOUT" ? "DOWN" : "DEGRADED",
    extraDelaySec: event.extraDelaySec ?? 0,
    healthMultiplier: event.healthMultiplier ?? 1,
    untilSec: event.untilSec,
    note: event.note,
  };
}

export function restoreChannel(
  channel: ChannelRuntime,
  atSec: SimSeconds,
  forced = false,
): ChannelRuntime {
  if (!forced && channel.untilSec !== atSec) {
    return channel;
  }
  return {
    ...healthyChannel(channel.id),
    lastDeliveredAtSec: channel.lastDeliveredAtSec,
  };
}
