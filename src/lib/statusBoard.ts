/**
 * The read-only agent status board has its own address (`?app=board`). It is a full-page view rather
 * than a state of the interactive Ovis shell, so entering or leaving it reloads the page and no pane
 * connection or control survives behind it. Other address parameters stay in place: leaving returns
 * to the pane and lens the app was showing.
 */

const PARAM = "app";
const BOARD = "board";

/** Whether an address names the agent status board. */
export function statusBoardAddress(search: string): boolean {
  return new URLSearchParams(search).get(PARAM) === BOARD;
}

/** `search` with the board's mark set or dropped, everything else as it was. */
export function withStatusBoardAddress(search: string, board: boolean): string {
  const query = new URLSearchParams(search);
  if (board) query.set(PARAM, BOARD);
  else if (query.get(PARAM) === BOARD) query.delete(PARAM);
  const text = query.toString();
  return text ? `?${text}` : "";
}
