import { describe, expect, it } from "bun:test";
import type { PullRequestView } from "../../shared/pull-request.ts";
import { statusBoardAddress, statusBoardIssueNumber, statusBoardIssueUrl, statusBoardPullRequestState, withStatusBoardAddress } from "./statusBoard.ts";

const PR: PullRequestView = {
  number: 12, title: "Fix the thing", url: "https://github.com/acme/widgets/pull/12", state: "open", draft: false,
  head_ref: "fix/thing", base_ref: "main", head_oid: "f".repeat(40), merge_state: "clean", merge_queue: false, mergeable: true, merge_method: "squash",
  checks: [], threads: [], threads_truncated: false,
};

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

describe("status board work context", () => {
  it("prioritizes lifecycle and failing checks when summarizing a pull request", () => {
    expect(statusBoardPullRequestState({ ...PR, draft: true })).toBe("draft");
    expect(statusBoardPullRequestState({ ...PR, state: "merged" })).toBe("merged");
    expect(statusBoardPullRequestState({ ...PR, checks: [{ name: "test", workflow: "CI", state: "fail", url: null, job_id: null }] })).toBe("failing");
    expect(statusBoardPullRequestState({ ...PR, checks: [{ name: "test", workflow: "CI", state: "pending", url: null, job_id: null }] })).toBe("pending");
    expect(statusBoardPullRequestState(PR)).toBe("ready");
  });

  it("finds explicitly linked issues without confusing the pull request number for one", () => {
    expect(statusBoardIssueNumber({ ...PR, title: "Fixes #187: restore board", head_ref: "fix/board" })).toBe(187);
    expect(statusBoardIssueNumber({ ...PR, title: "Restore board", head_ref: "issue-91-status-board" })).toBe(91);
    expect(statusBoardIssueNumber(PR)).toBeNull();
    expect(statusBoardIssueUrl(PR, 187)).toBe("https://github.com/acme/widgets/issues/187");
  });
});
