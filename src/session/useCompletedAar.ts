import { useCallback, useEffect, useMemo, useState } from "react";
import type { Aar } from "../engine/aar";
import type { TraineeView } from "../engine/view";
import type { SessionClient } from "./SessionClient";
import { RemoteSessionClient } from "./RemoteSessionClient";

export function useCompletedAar(
  client: SessionClient | null,
  view: TraineeView | null,
) {
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<{
    client: RemoteSessionClient;
    atSec: number;
    seq: number;
    aar: Aar | null;
    error: string | null;
  } | null>(null);
  const ready = view?.phase === "COMPLETE" && view.aarReady;
  const network = client instanceof RemoteSessionClient ? client : null;
  const completedSequence = network && ready ? network.getSnapshot().seq : null;
  const local = useMemo(() => {
    if (!client || network || !ready) return { aar: null, error: null };
    try {
      return { aar: client.getAar(), error: null };
    } catch (cause) {
      return {
        aar: null,
        error:
          cause instanceof Error
            ? cause.message
            : "The completed AAR could not be reconstructed.",
      };
    }
  }, [client, network, ready, view, attempt]);

  useEffect(() => {
    setRemote(null);
    if (!network || !ready || !view || completedSequence === null) return;
    let active = true;
    const atSec = view.nowSec;
    void network.fetchAar().then(
      (aar) => {
        if (active)
          setRemote({
            client: network,
            atSec,
            seq: completedSequence,
            aar,
            error: null,
          });
      },
      (cause: unknown) => {
        if (active)
          setRemote({
            client: network,
            atSec,
            seq: completedSequence,
            aar: null,
            error:
              cause instanceof Error
                ? cause.message
                : "The authorized team AAR could not be loaded.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [network, ready, view?.nowSec, completedSequence, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current =
    ready &&
    remote?.client === network &&
    remote?.atSec === view?.nowSec &&
    remote?.seq === completedSequence
      ? remote
      : null;
  const result = network
    ? { aar: current?.aar ?? null, error: current?.error ?? null }
    : local;
  return { ...result, retry, loading: !!network && ready && !current };
}
