import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import type { TraineeView } from "@/engine/view";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import type { SessionClient } from "@/session/SessionClient";

export const presentationNavigationSchema = z.object({
  returnTo: z.string().optional(),
  restoreFocus: z.literal("presentation-entry").optional(),
  openConsole: z.enum(["decision", "instructor"]).optional(),
});

export function PresentationEntry({
  client,
  view,
  demo = false,
}: {
  client: SessionClient;
  view: TraineeView;
  demo?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const network = client instanceof RemoteSessionClient ? client : null;
  useEffect(() => {
    const state = presentationNavigationSchema.safeParse(location.state);
    if (state.success && state.data.restoreFocus)
      document.getElementById("presentation-entry")?.focus();
  }, [location.key, location.state]);
  if (network?.role === "INSTRUCTOR" && view.phase !== "COMPLETE") return null;
  const mode = network ? "network" : demo ? "demo" : "local";
  const id = network?.code ?? view.scenario.id;
  return (
    <Button
      id="presentation-entry"
      size="sm"
      data-testid="enter-presentation"
      onClick={() =>
        navigate(`/presentation/${mode}/${encodeURIComponent(id)}`, {
          state: { returnTo: `${location.pathname}${location.search}` },
        })
      }
    >
      Presentation mode
    </Button>
  );
}
