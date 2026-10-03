import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SessionClient } from "./SessionClient";
import type { RemoteSessionClient } from "./RemoteSessionClient";

export function useSessionView(client: SessionClient | null) {
  const subscribe = useCallback(
    (listener: () => void) => client?.subscribe(listener) ?? (() => {}),
    [client],
  );
  const snapshot = useCallback(() => client?.getSnapshot() ?? null, [client]);
  return useSyncExternalStore(subscribe, snapshot);
}

export function useRemoteStatus(client: RemoteSessionClient | null) {
  const [connection, setConnection] = useState({
    status: client?.status ?? null,
    message: client?.statusMessage ?? "",
  });
  useEffect(() => {
    const update = () =>
      setConnection({
        status: client?.status ?? null,
        message: client?.statusMessage ?? "",
      });
    update();
    return client?.subscribeStatus(update);
  }, [client]);
  return connection;
}
