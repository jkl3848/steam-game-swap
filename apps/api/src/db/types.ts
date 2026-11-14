export type SwapStatus =
  | "draft"
  | "open"
  | "locked"
  | "matched"
  | "completed"
  | "cancelled";

export type User = {
  id: string;
  discordId: string;
  discordTag: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Swap = {
  id: string;
  code: string;
  title: string;
  rulesText: string | null;
  startDate: Date;
  giftDeadline: Date;
  priceMin: number | null;
  priceMax: number | null;
  status: SwapStatus;
  autoMatch: boolean;
  creatorUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Participant = {
  id: string;
  swapId: string;
  firstName: string;
  steamUsername: string;
  steamId: string | null;
  discordUserId: string | null;
  discordTag: string | null;
  secretTokenHash: string;
  joinedAt: Date;
  updatedAt: Date;
};

export type WishlistItem = {
  id: string;
  participantId: string;
  steamAppId: number;
  name: string;
  storeUrl: string;
  priceHint: string | null;
  sortOrder: number;
  createdAt: Date;
};

export type BlackoutPair = {
  id: string;
  swapId: string;
  participantAId: string;
  participantBId: string;
  createdAt: Date;
};

export type Assignment = {
  id: string;
  swapId: string;
  giverId: string;
  receiverId: string;
  sentAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
};

export type OAuthState = {
  id: string;
  type: "creator" | "participant_link";
  swapCode?: string;
  expiresAt: Date;
};
