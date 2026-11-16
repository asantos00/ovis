import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { useT } from "../lib/i18n.ts";
import { useMachineSessions } from "../lib/machineSessionContext.tsx";

interface AgentStatusTerminalProps {
  machineId: string;
  paneId: string;
}

/** A pane's live attach stream viewed without an input lease or a PTY resize. */
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

    const watch = (): void => {
      if (disposed) return;
      try { fit.fit(); } catch { return; }
      if (terminal.cols < 2 || terminal.rows < 2 || (terminal.cols === watchedCols && terminal.rows === watchedRows)) return;
      watchedCols = terminal.cols;
      watchedRows = terminal.rows;
      watching = socket.watch(paneId, terminal.cols, terminal.rows);
      setNote(watching ? null : t("Terminal unavailable"));
    };
    const off = session.on((message) => {
      if (disposed || !("pane_id" in message) || message.pane_id !== paneId) return;
      if (message.type === "watch-data") {
        setNote(null);
        terminal.write(message.data);
      } else if (message.type === "watch-end") {
        setNote(t("Terminal paused"));
      } else if (message.type === "pty-exit") {
        setNote(t("Terminal has ended"));
      } else if (message.type === "error" && (message.code === "watch_failed" || message.code === "pane_not_found")) {
        setNote(message.message || t("Terminal unavailable"));
      }
    });
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(watch);
    });
    resize.observe(host);
    session.connect();
    fitFrame = requestAnimationFrame(watch);

    return () => {
      disposed = true;
      cancelAnimationFrame(fitFrame);
      resize.disconnect();
      off();
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
