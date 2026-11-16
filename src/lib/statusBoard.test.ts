import { describe, expect, it } from "bun:test";
import { statusBoardAddress, withStatusBoardAddress } from "./statusBoard.ts";

describe("the agent status board's address", () => {
  it("is the app parameter saying board, and nothing else", () => {
    expect(statusBoardAddress("?app=board")).toBe(true);
    expect(statusBoardAddress("?pane=p1&app=board&view=chat")).toBe(true);
    expect(statusBoardAddress("")).toBe(false);
    expect(statusBoardAddress("?app=inbox")).toBe(false);
    expect(statusBoardAddress("?board=1")).toBe(false);
  });

  it("is set and dropped with every other parameter left as it was", () => {
    expect(withStatusBoardAddress("", true)).toBe("?app=board");
    expect(withStatusBoardAddress("?pane=p1&view=chat", true)).toBe("?pane=p1&view=chat&app=board");
    expect(withStatusBoardAddress("?app=board&pane=p1&view=chat", false)).toBe("?pane=p1&view=chat");
    expect(withStatusBoardAddress("?app=board", false)).toBe("");
  });

  it("leaves another app value alone when the board is left", () => {
    expect(withStatusBoardAddress("?app=inbox&pane=p1", false)).toBe("?app=inbox&pane=p1");
  });
});
