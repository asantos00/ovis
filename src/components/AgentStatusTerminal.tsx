import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { fetchPaneScreen } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { useMachineSessions } from "../lib/machineSessionContext.tsx";
import { startStatusBoardTerminalPolling, statusBoardTerminalSource } from "../lib/statusBoardTerminal.ts";

interface AgentStatusTerminalProps {
  machineId: string;
  paneId: string;
}

/** A pane viewed through read-only watch, or passive screen reads when herdr-core has no watch. */
export function AgentStatusTerminal({ machineId, paneId }: AgentStatusTerminalProps) {
  const t = useT();
  const sessions = useMachineSessions();
  const hostRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || sessions === null) {
      setNote(t("Terminal unavailable"));
      return;
    }
    const style = getComputedStyle(host);
    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: style.getPropertyValue("--font-terminal").trim() || "ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 0,
      theme: {
        background: style.getPropertyValue("--bg").trim(),
        foreground: style.getPropertyValue("--text").trim(),
        cursor: style.getPropertyValue("--text-muted").trim(),
        selectionBackground: style.getPropertyValue("--selection").trim(),
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);

    const session = sessions.get(machineId);
    const socket = session.socket;
    let disposed = false;
    let watching = false;
    let fitFrame = 0;
    let watchedCols = 0;
    let watchedRows = 0;
    let stopPolling: (() => void) | null = null;

    const poll = (): void => {
      if (disposed || document.visibilityState === "hidden" || stopPolling !== null) return;
      if (watching) {
        socket.unwatch(paneId);
        watching = false;
      }
      stopPolling = startStatusBoardTerminalPolling({
        read: (signal) => fetchPaneScreen(paneId, machineId, signal),
        draw: (screen) => terminal.write(`\x1bc${screen.text}`),
        succeeded: () => setNote(null),
        failed: () => setNote(t("Terminal paused")),
      });
    };
    const watch = (): void => {
      if (disposed) return;
      try { fit.fit(); } catch { return; }
      const source = statusBoardTerminalSource(socket.featuresListed(), socket.canWatch());
      if (source === "read") {
        poll();
        return;
      }
      if (source === "watch" && stopPolling !== null) {
        stopPolling();
        stopPolling = null;
        watchedCols = 0;
        watchedRows = 0;
      }
      if (terminal.cols < 2 || terminal.rows < 2 || (terminal.cols === watchedCols && terminal.rows === watchedRows)) return;
      watchedCols = terminal.cols;
      watchedRows = terminal.rows;
      watching = socket.watch(paneId, terminal.cols, terminal.rows);
    };
    const off = session.on((message) => {
      if (disposed) return;
      if (message.type === "features" || message.type === "snapshot") {
        watch();
        return;
      }
      if (!("pane_id" in message) || message.pane_id !== paneId) return;
      if (message.type === "watch-data") {
        setNote(null);
        terminal.write(message.data);
      } else if (message.type === "watch-end") {
        if (statusBoardTerminalSource(socket.featuresListed(), socket.canWatch()) === "read") poll();
        else setNote(t("Terminal paused"));
      } else if (message.type === "pty-exit") {
        setNote(t("Terminal has ended"));
      } else if (message.type === "error" && (message.code === "watch_failed" || message.code === "pane_not_found")) {
        setNote(message.message || t("Terminal unavailable"));
      }
    });
    const refit = (): void => {
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(watch);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refit);
    const visibility = (): void => {
      if (document.visibilityState === "hidden") {
        stopPolling?.();
        stopPolling = null;
      } else {
        watch();
      }
    };
    if (resize === null) window.addEventListener("resize", refit);
    else resize.observe(host);
    document.addEventListener("visibilitychange", visibility);
    session.connect();
    fitFrame = requestAnimationFrame(watch);

    return () => {
      disposed = true;
      cancelAnimationFrame(fitFrame);
      resize?.disconnect();
      window.removeEventListener("resize", refit);
      document.removeEventListener("visibilitychange", visibility);
      off();
      stopPolling?.();
      if (watching) socket.unwatch(paneId);
      terminal.dispose();
    };
  }, [machineId, paneId, sessions, t]);

  return (
    <div className="status-board-terminal-frame">
      <div className="status-board-terminal" ref={hostRef} aria-label={t("Live terminal")} />
      {note !== null && <p className="status-board-terminal-note" role="status">{note}</p>}
    </div>
  );
}
