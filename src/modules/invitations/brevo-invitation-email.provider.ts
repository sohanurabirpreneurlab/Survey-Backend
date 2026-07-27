import { env } from "../../config/env";
import { BrevoEmailService } from "../../common/services/brevo-email.service";
import type { IInvitationEmailProvider } from "./invitation-email-provider.interface";
import type { SendInvitationEmailInput, SendInvitationEmailResult } from "./invitation.types";

export class BrevoInvitationEmailProvider implements IInvitationEmailProvider {
  public constructor(private readonly brevoEmailService = new BrevoEmailService()) {}

  public async sendInvitation(
    input: SendInvitationEmailInput
  ): Promise<SendInvitationEmailResult> {
    const result = await this.brevoEmailService.sendEmail({
      htmlContent: buildInvitationHtml(input),
      subject: `You're invited to participate in "${input.surveyTitle}"`,
      textContent: buildInvitationText(input),
      to: [{ email: input.recipientEmail }]
    });

    return {
      provider: "brevo",
      providerMessageId: result.messageId,
      status: "sent"
    };
  }
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatExpiry = (value: string | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
};

const buildInvitationHtml = (input: SendInvitationEmailInput) => {
  const appName = escapeHtml(env.brevoSenderName ?? "Survey Platform");
  const title = escapeHtml(input.surveyTitle);
  const description = input.surveyDescription ? escapeHtml(input.surveyDescription) : null;
  const invitationUrl = escapeHtml(input.invitationUrl);
  const expiry = formatExpiry(input.expiresAt);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#163b6d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f6fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background-color:#ffffff;border:1px solid #d9e2f0;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px;background:linear-gradient(135deg,#163b6d 0%,#1f5ca8 100%);color:#ffffff;">
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.88;">${appName}</div>
                <h1 style="margin:14px 0 0;font-size:28px;line-height:1.2;font-weight:700;color:#ffffff;">Survey Invitation</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#314e75;">Hello,</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#314e75;">You have been invited to participate in the following survey.</p>
                <div style="margin:0 0 24px;padding:20px;border:1px solid #d9e2f0;border-radius:16px;background-color:#f8fbff;">
                  <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#54739e;margin-bottom:8px;">Survey</div>
                  <div style="font-size:24px;line-height:1.3;font-weight:700;color:#163b6d;">${title}</div>
                  ${description ? `<div style="margin-top:12px;font-size:15px;line-height:1.7;color:#4c678f;">${description}</div>` : ""}
                </div>
                <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#314e75;">Please click the button below to begin.</p>
                <div style="margin:0 0 28px;">
                  <a href="${invitationUrl}" style="display:inline-block;padding:14px 28px;border-radius:999px;background-color:#163b6d;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Start Survey</a>
                </div>
                <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#54739e;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.7;word-break:break-all;color:#163b6d;">${invitationUrl}</p>
                ${expiry ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#54739e;">This invitation expires on <strong style="color:#163b6d;">${escapeHtml(expiry)} UTC</strong>.</p>` : ""}
                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#314e75;">Thank you.</p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#54739e;">This email was sent by ${appName}. If you were not expecting this invitation, you may safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildInvitationText = (input: SendInvitationEmailInput) => {
  const lines = [
    `${env.brevoSenderName ?? "Survey Platform"}`,
    "",
    "Survey Invitation",
    "",
    "Hello,",
    "",
    "You have been invited to participate in the following survey.",
    "",
    `Survey: ${input.surveyTitle}`
  ];

  if (input.surveyDescription) {
    lines.push("", `Description: ${input.surveyDescription}`);
  }

  lines.push(
    "",
    "Please open the secure link below to begin:",
    input.invitationUrl
  );

  const expiry = formatExpiry(input.expiresAt);

  if (expiry) {
    lines.push("", `This invitation expires on ${expiry} UTC.`);
  }

  lines.push(
    "",
    "Thank you.",
    `This email was sent by ${env.brevoSenderName ?? "Survey Platform"}.`,
    "If you were not expecting this invitation, you may safely ignore this email."
  );

  return lines.join("\n");
};
