import type { PaneReadResult } from "../../shared/protocol.ts";

export type StatusBoardTerminalSource = "pending" | "watch" | "read";

/** Wait for capabilities, then prefer watch and use passive pane snapshots on herdr-core. */
export function statusBoardTerminalSource(featuresListed: boolean, canWatch: boolean): StatusBoardTerminalSource {
  if (!featuresListed) return "pending";
  return canWatch ? "watch" : "read";
}

interface StatusBoardTerminalPolling {
  read(signal: AbortSignal): Promise<Pick<PaneReadResult, "revision" | "text">>;
  draw(screen: Pick<PaneReadResult, "revision" | "text">): void;
  succeeded?(): void;
  failed(error: unknown): void;
  schedule?(run: () => void, delay: number): unknown;
  cancel?(handle: unknown): void;
}

/** Polls herdr-core's read-only visible screen without overlapping reads or redrawing unchanged panes. */
export function startStatusBoardTerminalPolling(options: StatusBoardTerminalPolling): () => void {
  const schedule = options.schedule ?? ((run: () => void, delay: number) => setTimeout(run, delay));
  const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let timer: unknown = null;
  let controller: AbortController | null = null;
  let revision: number | null = null;

  const poll = (): void => {
    if (stopped) return;
    controller = new AbortController();
    void options.read(controller.signal).then((screen) => {
      if (stopped) return;
      options.succeeded?.();
      if (screen.revision !== revision) {
        revision = screen.revision;
        options.draw(screen);
      }
    }, (error: unknown) => {
      if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) options.failed(error);
    }).finally(() => {
      controller = null;
      if (!stopped) timer = schedule(poll, 1_000);
    });
  };
  poll();

  return () => {
    stopped = true;
    controller?.abort();
    if (timer !== null) cancel(timer);
  };
}
