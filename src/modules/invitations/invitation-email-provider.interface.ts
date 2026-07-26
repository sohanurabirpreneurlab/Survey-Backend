import type { SendInvitationEmailInput, SendInvitationEmailResult } from "./invitation.types";

export interface IInvitationEmailProvider {
  sendInvitation(input: SendInvitationEmailInput): Promise<SendInvitationEmailResult>;
}
