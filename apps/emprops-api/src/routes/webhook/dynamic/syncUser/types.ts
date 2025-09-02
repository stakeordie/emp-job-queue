export interface VerifiedCredential {
  chain?: string;
  address?: string;
  walletName?: string;
  format: string;
  id: string;
  publicIdentifier: string;
  lastSelectedAt?: string;
  walletProvider?: string;
  email?: string;
  oauthUsername?: string;
  oauthAccountId?: string;
  oauthDisplayName?: string;
  oauthAccountPhotos?: string[];
  oauthEmails?: string[];
  oauthProvider?: string;
}

export interface UserUpdatedData {
  missingFields: any[];
  lastName: string;
  lastVerifiedCredentialId: string;
  mfaBackupCodeAcknowledgement: any;
  lastVisit: string;
  sessionId: string;
  firstName: string;
  projectEnvironmentId: string;
  lists: any[];
  newUser: boolean;
  verifiedCredentials: VerifiedCredential[];
  id: string;
  firstVisit: string;
  email: string;
  username: string;
}

export interface WalletLinkedData {
  chain: string;
  lowerPublicKey: string;
  publicKey: string;
  userId: string;
  turnkeyHDWalletId: any;
  lastSelectedAt: string;
  createdAt: string;
  deletedAt: any;
  projectEnvironmentId: string;
  provider: string;
  name: string;
  id: string;
  hardwareWallet: any;
  signerWalletId: any;
  updatedAt: string;
}

export interface DynamicWebhookBody<T> {
  eventName: string;
  data: T;
}

export type UserUpdatedBody = DynamicWebhookBody<UserUpdatedData>;
export type WalletLinkedBody = DynamicWebhookBody<WalletLinkedData>;
