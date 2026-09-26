type AttentionSource = { href: string; title: string; reason: string };

export function chooseCommandCenterNextAction(
  recentActiveNotifications: readonly AttentionSource[],
) {
  const recent = recentActiveNotifications[0];
  if (recent) {
    return {
      href: recent.href,
      label: `Review ${recent.title}`,
      reason: recent.reason,
      source: "notification" as const,
    };
  }
  return {
    href: "/inbox",
    label: "Review captures in Inbox",
    reason:
      "No current local notification needs a next step. Review original captures awaiting filing.",
    source: "inbox" as const,
  };
}
