import { useEffect, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { isElementVisible } from "@/components/ui/useDialogFocus";
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
  focusFallback,
}: {
  client: SessionClient;
  view: TraineeView;
  demo?: boolean;
  focusFallback?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const network = client instanceof RemoteSessionClient ? client : null;
  useEffect(() => {
    const state = presentationNavigationSchema.safeParse(location.state);
    if (state.success && state.data.restoreFocus) {
      const entry = document.getElementById("presentation-entry");
      (entry && isElementVisible(entry)
        ? entry
        : focusFallback?.current
      )?.focus();
    }
  }, [location.key, location.state, focusFallback]);
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
