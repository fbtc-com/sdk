/**
 * Coinbase AgentKit fires sendAnalyticsEvent() without awaiting/.catch().
 * When cca-lite.coinbase.com is unreachable, the rejected promise becomes an
 * unhandledRejection and can crash Node. Ignore those failures in the demo CLI.
 */
export function silenceAgentkitAnalytics(): void {
  process.on("unhandledRejection", (reason) => {
    if (isAgentkitAnalyticsFailure(reason)) {
      return;
    }
    console.error("Unhandled rejection:", reason);
  });
}

function isAgentkitAnalyticsFailure(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;

  const cause = (reason as Error & { cause?: unknown }).cause;
  const causeCode =
    typeof cause === "object" && cause && "code" in cause
      ? String((cause as { code?: string }).code ?? "")
      : "";
  const causeName = cause instanceof Error ? cause.name : "";
  const causeMessage = cause instanceof Error ? cause.message : String(cause ?? "");
  const stack = reason.stack ?? "";

  const isFetchFailed = reason.message === "fetch failed";
  const isNetworkCause =
    causeCode === "ECONNRESET" ||
    causeCode === "ECONNREFUSED" ||
    causeCode === "ENOTFOUND" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeName.includes("ConnectTimeoutError") ||
    causeName.includes("UND_ERR_CONNECT") ||
    causeMessage.includes("Connect Timeout") ||
    causeMessage.includes("ECONNRESET") ||
    /read ECONNRESET/i.test(causeMessage);

  const isAgentkitAnalyticsStack =
    stack.includes("sendAnalyticsEvent") ||
    stack.includes("@coinbase/agentkit");

  return isFetchFailed && (isNetworkCause || isAgentkitAnalyticsStack);
}
