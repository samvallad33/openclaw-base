import { getGatewayRestartDrainSignal } from "../../process/gateway-work-admission.js";

// Deferred maintenance aborts on process termination signals; one handler pair is shared by
// every active controller and re-raises the signal when maintenance was its only listener.
const DEFERRED_TURN_MAINTENANCE_ABORT_STATE_KEY = Symbol.for(
  "openclaw.contextEngineTurnMaintenanceAbortState",
);

type DeferredTurnMaintenanceSignal = "SIGINT" | "SIGTERM";
type DeferredTurnMaintenanceProcessLike = Pick<NodeJS.Process, "on" | "off"> &
  Partial<Pick<NodeJS.Process, "listenerCount" | "kill" | "pid">> & {
    [DEFERRED_TURN_MAINTENANCE_ABORT_STATE_KEY]?: DeferredTurnMaintenanceAbortState;
  };
type DeferredTurnMaintenanceAbortState = {
  controllers: Set<AbortController>;
  cleanupHandlers: Map<DeferredTurnMaintenanceSignal, () => void>;
};

function unregisterDeferredTurnMaintenanceAbortSignalHandlers(
  processLike: DeferredTurnMaintenanceProcessLike,
  state: DeferredTurnMaintenanceAbortState,
): void {
  for (const [signal, handler] of state.cleanupHandlers) {
    processLike.off(signal, handler);
  }
  state.cleanupHandlers.clear();
}

export function createDeferredTurnMaintenanceAbortSignal(params?: {
  processLike?: DeferredTurnMaintenanceProcessLike;
}): {
  abortSignal: AbortSignal;
  dispose: () => void;
} {
  const processLike = (params?.processLike ?? process) as DeferredTurnMaintenanceProcessLike;
  const state = (processLike[DEFERRED_TURN_MAINTENANCE_ABORT_STATE_KEY] ??= {
    controllers: new Set<AbortController>(),
    cleanupHandlers: new Map<DeferredTurnMaintenanceSignal, () => void>(),
  });
  const handleTerminationSignal = (signalName: DeferredTurnMaintenanceSignal) => {
    const shouldReraise = processLike.listenerCount?.(signalName) === 1;
    for (const activeController of state.controllers) {
      if (!activeController.signal.aborted) {
        activeController.abort(
          new Error(`received ${signalName} while waiting for deferred maintenance`),
        );
      }
    }
    state.controllers.clear();
    unregisterDeferredTurnMaintenanceAbortSignalHandlers(processLike, state);
    if (shouldReraise && typeof processLike.kill === "function") {
      try {
        processLike.kill(processLike.pid ?? process.pid, signalName);
      } catch {
        // Ignore shutdown-path failures.
      }
    }
  };
  if (state.cleanupHandlers.size === 0) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const handler = () => handleTerminationSignal(signal);
      state.cleanupHandlers.set(signal, handler);
      processLike.on(signal, handler);
    }
  }

  const controller = new AbortController();
  const abortSignal = AbortSignal.any([controller.signal, getGatewayRestartDrainSignal()]);
  state.controllers.add(controller);
  return {
    abortSignal,
    dispose: () => {
      state.controllers.delete(controller);
      if (state.controllers.size === 0) {
        unregisterDeferredTurnMaintenanceAbortSignalHandlers(processLike, state);
      }
    },
  };
}

export function resetDeferredTurnMaintenanceAbortStateForTest(): void {
  const processLike = process as DeferredTurnMaintenanceProcessLike;
  const state = processLike[DEFERRED_TURN_MAINTENANCE_ABORT_STATE_KEY];
  if (!state) {
    return;
  }
  state.controllers.clear();
  unregisterDeferredTurnMaintenanceAbortSignalHandlers(processLike, state);
  delete processLike[DEFERRED_TURN_MAINTENANCE_ABORT_STATE_KEY];
}
