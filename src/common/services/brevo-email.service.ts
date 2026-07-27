import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { env } from "../../config/env";

export type SendBrevoEmailInput = {
  htmlContent: string;
  subject: string;
  textContent: string;
  to: Array<{ email: string; name?: string }>;
};

export type SendBrevoEmailResult = {
  messageId: string | null;
};

export class BrevoEmailService {
  public async sendEmail(input: SendBrevoEmailInput): Promise<SendBrevoEmailResult> {
    if (!env.brevoApiKey || !env.brevoSenderEmail || !env.brevoSenderName) {
      throw new AppError(
        ERROR_CODES.emailProviderError,
        "Email delivery is not configured.",
        503
      );
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      body: JSON.stringify({
        htmlContent: input.htmlContent,
        sender: {
          email: env.brevoSenderEmail,
          name: env.brevoSenderName
        },
        subject: input.subject,
        textContent: input.textContent,
        to: input.to
      }),
      headers: {
        "api-key": env.brevoApiKey,
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetails = parseBrevoErrorDetails(errorText);

      throw new AppError(
        ERROR_CODES.emailProviderError,
        buildBrevoErrorMessage(response.status, errorDetails),
        502,
        {
          provider: "brevo",
          responseBody: errorDetails.raw,
          responseStatus: response.status
        }
      );
    }

    const data = (await response.json()) as { messageId?: string };

    return {
      messageId: data.messageId ?? null
    };
  }
}

const parseBrevoErrorDetails = (value: string) => {
  if (!value.trim()) {
    return {
      raw: null,
      message: null
    };
  }

  try {
    const parsed = JSON.parse(value) as { code?: string; message?: string };

    return {
      raw: value,
      message: parsed.message ?? parsed.code ?? null
    };
  } catch {
    return {
      raw: value,
      message: value
    };
  }
};

const buildBrevoErrorMessage = (
  status: number,
  details: ReturnType<typeof parseBrevoErrorDetails>
) =>
  details.message
    ? `Brevo could not send the email (${status}): ${details.message}`
    : `Brevo could not send the email (${status}).`;
