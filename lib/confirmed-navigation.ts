export const CONFIRMED_LINK_NAVIGATION_EVENT = "sokna-confirmed-link-navigation";

export interface ConfirmedLinkNavigation {
  href: string;
  data: Record<string, string | undefined>;
}

/** Preserve link metadata even if its popover or original DOM node disappears. */
export function captureLinkNavigation(anchor: HTMLAnchorElement): ConfirmedLinkNavigation {
  return { href: anchor.href, data: { ...anchor.dataset } };
}

/** Emitted only after the user approves navigation intercepted by a leave guard. */
export function dispatchConfirmedLinkNavigation(navigation: ConfirmedLinkNavigation) {
  window.dispatchEvent(new CustomEvent(CONFIRMED_LINK_NAVIGATION_EVENT, { detail: navigation }));
}
