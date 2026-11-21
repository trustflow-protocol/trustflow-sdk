import type { StellarAddress } from './index';

/** A user's profile as stored on the TrustFlow backend. */
export interface Profile {
  /** Stellar address that owns this profile. */
  address: StellarAddress;
  /** Display name shown across the marketplace. */
  displayName?: string;
  /** Free-text biography. */
  bio?: string;
  /** URL of the profile's avatar image. */
  avatarUrl?: string;
  /** ISO 8601 timestamp of the last update. */
  updatedAt?: string;
}

/** Fields accepted when updating a profile. All fields are optional partial updates. */
export interface UpdateProfileParams {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

/** A single entry returned by the profile search endpoint. */
export interface ProfileSearchResult {
  address: StellarAddress;
  displayName?: string;
  avatarUrl?: string;
  /** Relevance score assigned by the backend. */
  score?: number;
}

/** Options accepted by {@link ProfileClient.searchProfiles}. */
export interface SearchProfilesParams {
  /** Free-text search query.  Will be URL-encoded before being sent. */
  q: string;
  /** Maximum number of results to return (backend default applies when omitted). */
  limit?: number;
  /** Zero-based page offset (backend default applies when omitted). */
  offset?: number;
}
