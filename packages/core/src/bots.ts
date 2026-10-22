/** Every Bot this project creates is prefixed "cb-" so it is easy to find in the Grok Bot app. */
export const BOT_PREFIX = "cb-";
export const SCOUT_BOT = "cb-scout";
export const MATCHMAKER_BOT = "cb-matchmaker";
export const SCRIBE_BOT = "cb-scribe";

export function communityBotName(communityId: string): string {
  return `${BOT_PREFIX}${communityId}`;
}

/** "Unicorn Mafia" -> "Unicorn Mafia Bot" (the speaker label in the chat). */
export function botSpeakerName(communityName: string): string {
  return `${communityName} Bot`;
}

/** Speaker label for the human organiser's opening message. */
export function organiserSpeakerName(communityName: string): string {
  return `${communityName} organiser`;
}
