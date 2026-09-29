import { ChatTextIcon, MessengerLogoIcon } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { smsHref, VENUE_MESSENGER_URL } from "@/lib/venue";

import { PRESS } from "./press";

/**
 * The two ways to book by message, and the only two the page offers (spec
 * 0013, AC-13, AC-18): Messenger, and a text to the front desk. The Visit
 * card, the message card and the coming soon toast all offer these and no
 * others, so a player meets the same two doors wherever they look.
 */
export function ChannelButtons({
  body,
  className,
}: {
  /** A prefilled text message, when the player already picked hours. */
  body?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        asChild
        className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-11 px-4", PRESS)}
      >
        <a href={VENUE_MESSENGER_URL} target="_blank" rel="noopener noreferrer">
          <MessengerLogoIcon aria-hidden="true" weight="fill" data-icon="inline-start" />
          Messenger
        </a>
      </Button>
      <Button asChild variant="outline" className={cn("h-11 px-4", PRESS)}>
        <a href={smsHref(body)}>
          <ChatTextIcon aria-hidden="true" weight="bold" data-icon="inline-start" />
          Text us
        </a>
      </Button>
    </div>
  );
}
