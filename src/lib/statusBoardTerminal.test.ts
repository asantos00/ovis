import { describe, expect, it } from "bun:test";
import { startStatusBoardTerminalPolling, statusBoardTerminalSource } from "./statusBoardTerminal.ts";

describe("the status board terminal source", () => {
  it("falls back to pane reads when herdr-core lists no watch capability", () => {
    expect(statusBoardTerminalSource(false, true)).toBe("pending");
    expect(statusBoardTerminalSource(true, true)).toBe("watch");
    expect(statusBoardTerminalSource(true, false)).toBe("read");
  });

  it("polls immediately and redraws only when the pane revision changes", async () => {
    const answers = [
      { revision: 4, text: "first" },
      { revision: 4, text: "same" },
      { revision: 5, text: "second" },
    ];
    const draws: string[] = [];
    const delays: number[] = [];
    let successes = 0;
    let next: (() => void) | null = null;
    let reads = 0;
    const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };
    const stop = startStatusBoardTerminalPolling({
      read: async () => answers[reads++]!,
      draw: (screen) => draws.push(screen.text),
      succeeded: () => { successes += 1; },
      failed: () => { throw new Error("read failed"); },
      schedule: (run, delay) => { next = run; delays.push(delay); return delays.length; },
      cancel: () => {},
    });

    await settle();
    expect(reads).toBe(1);
    expect(draws).toEqual(["first"]);
    expect(successes).toBe(1);
    expect(delays).toEqual([1_000]);

    next!();
    await settle();
    expect(reads).toBe(2);
    expect(draws).toEqual(["first"]);
    expect(successes).toBe(2);

    next!();
    await settle();
    expect(reads).toBe(3);
    expect(draws).toEqual(["first", "second"]);
    expect(successes).toBe(3);

    stop();
  });
});
