import type { UserProfile } from "./auth.types";

export interface IUserProfileRepository {
  create(input: { fullName: string; userId: string }): Promise<UserProfile>;
  findByUserId(userId: string): Promise<UserProfile | null>;
}
