import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { env } from "../../config/env";
import type { IInvitationEmailProvider } from "./invitation-email-provider.interface";
import type { SendInvitationEmailInput, SendInvitationEmailResult } from "./invitation.types";

export class BrevoInvitationEmailProvider implements IInvitationEmailProvider {
  public async sendInvitation(
    input: SendInvitationEmailInput
  ): Promise<SendInvitationEmailResult> {
    if (!env.brevoApiKey || !env.brevoSenderEmail || !env.brevoSenderName) {
      throw new AppError(
        ERROR_CODES.emailProviderError,
        "Invitation email delivery is not configured.",
        503
      );
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      body: JSON.stringify({
        params: {
          invitationUrl: input.invitationUrl,
          surveySlug: input.surveySlug,
          surveyTitle: input.surveyTitle
        },
        sender: {
          email: env.brevoSenderEmail,
          name: env.brevoSenderName
        },
        subject: `Invitation to ${input.surveyTitle}`,
        textContent: `You have been invited to complete ${input.surveyTitle}. Open this secure link: ${input.invitationUrl}`,
        to: [{ email: input.recipientEmail }]
      }),
      headers: {
        "api-key": env.brevoApiKey,
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new AppError(
        ERROR_CODES.emailProviderError,
        "Brevo could not send the invitation email.",
        502
      );
    }

    const data = (await response.json()) as { messageId?: string };

    return {
      provider: "brevo",
      providerMessageId: data.messageId ?? null,
      status: "sent"
    };
  }
}
