import { useCallback, useEffect, useState } from "react";

import type { Machine } from "../shared/machines.ts";
import { AccessGate } from "./components/AccessGate.tsx";
import { AgentStatusBoard, AgentStatusBoardConnecting } from "./components/AgentStatusBoard.tsx";
import { ApiError, fetchMachines } from "./lib/api.ts";
import { useAgentStateStamping } from "./lib/useAgentStateSince.ts";
import { useT } from "./lib/i18n.ts";
import { MachineSessionRegistry } from "./lib/machineSession.ts";
import { MachineSessionsProvider } from "./lib/machineSessionContext.tsx";
import { pageAddress, pageSearch } from "./lib/pageQuery.ts";
import { useSettings } from "./lib/settings.ts";
import { useSidebarActivityState } from "./lib/sidebarActivity.tsx";
import { statusBoardAddress, withStatusBoardAddress } from "./lib/statusBoard.ts";
import { useAccessState, usePairFromAddress } from "./lib/useAccess.ts";
import { newQuestionReads } from "./lib/useInboxQuestions.ts";
import { newSummaryReads } from "./lib/useInboxSummaries.ts";
import { useScreenWakeLock } from "./lib/wakeLock.ts";

const ROSTER_POLL_MS = 5_000;

/**
 * The status board starts outside the full interactive App module. Besides making the display a
 * smaller reload boundary, this keeps relay cryptography (and its BigInt-only parser/runtime) out
 * of the classic bundle loaded by Safari 12.
 */
export function StatusBoardApp() {
  const t = useT();
  const { settings } = useSettings();
  const [machineSessions] = useState(() => new MachineSessionRegistry());
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [questionReads] = useState(newQuestionReads);
  const [summaryReads] = useState(newSummaryReads);
  const { locked, setLocked, lockReason, pairCode, consumePairCode, pairingUnconfirmed, onPaired, auth, readBridgeHealth } = useAccessState({
    ui: settings.uiFontFamily,
    chat: settings.chatFontFamily,
  });

  const load = useCallback(async (): Promise<void> => {
    await readBridgeHealth();
    try {
      const next = await fetchMachines();
      setMachines(next);
      setLoaded(true);
      setFailure(null);
      setLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLocked(true);
        return;
      }
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [readBridgeHealth, setLocked]);

  useEffect(() => {
    let disposed = false;
    const read = (): void => {
      if (!disposed && document.visibilityState !== "hidden") void load();
    };
    read();
    const timer = window.setInterval(read, ROSTER_POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => () => machineSessions.closeAll(), [machineSessions]);
  useEffect(() => {
    document.title = `${t("Agent status board")} · Ovis`;
  }, [t]);
  usePairFromAddress({ locked, pairCode, auth, consumePairCode, onPaired, loadHealth: load });

  const activity = useSidebarActivityState(machines, "", null, () => "covered");
  useAgentStateStamping(machines, activity);
  useScreenWakeLock(settings.keepScreenOn && locked === false);

  const leave = (): void => {
    const search = pageSearch();
    if (!statusBoardAddress(search)) return;
    window.location.assign(pageAddress(window.location.pathname, withStatusBoardAddress(search, false), window.location.hash));
  };
  const unlock = (): void => {
    setLocked(false);
    void load();
  };

  if (locked === null) return <AgentStatusBoardConnecting onExit={leave} />;
  if (locked) return <AccessGate reason={lockReason} initialCode={pairCode} consumePairCode={consumePairCode} pairingUnconfirmed={pairingUnconfirmed} onPaired={onPaired} onUnlocked={unlock} />;
  return (
    <MachineSessionsProvider sessions={machineSessions} machineIds={machines.map((machine) => machine.id)}>
      <AgentStatusBoard machines={machines} activity={activity} connection={null} loaded={loaded} failure={failure}
        questionReads={questionReads} summaryReads={summaryReads} onExit={leave} />
    </MachineSessionsProvider>
  );
}
