# Send an invitation email from SaltHub

`POST /api/v1/integrations/survey-invitations/send`

Headers: `Authorization: Bearer <integration JWT>` and `Content-Type: application/json`.
Uses the same configured JWT issuer, audience, and required scope as existing integration endpoints. The token identity must be approved and have survey publish/manage permission in the survey's organization. The sender identity comes from the token, never from the request body.

```json
{
  "surveyId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com"
}
```

One recipient per request; email is trimmed and lowercased. The existing invitation creation/link and email template/provider flow handles both initial emails and reminders. A usable existing invitation is reused; otherwise one is created. Send attempts are recorded in `email_deliveries`, so the completion-status API includes successful sends.

HTTP 200:

```json
{
  "success": true,
  "message": "Survey invitation email sent successfully.",
  "data": {
    "surveyId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@example.com",
    "invitationId": "invitation-uuid",
    "status": "sent"
  },
  "meta": { "requestId": "request-uuid" }
}
```

`sent` means the provider accepted the email, not confirmed inbox delivery. Completion is checked before issuing the email link. The check and external email send are not atomic: a submission can still arrive between them.

HTTP 502 example:

```json
{
  "success": false,
  "error": {
    "code": "INVITATION_SEND_FAILED",
    "message": "The invitation email could not be sent.",
    "details": null
  },
  "meta": { "requestId": "request-uuid" }
}
```

SaltHub can display `error.message`, branch on `error.code`, and retain `meta.requestId` for troubleshooting. Do not depend on exact message text. Validation errors use an array of `{ location, message, path }` in `error.details`; other errors usually have `details: null`.

| HTTP | Error code | SaltHub handling |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Correct email or survey UUID; show field errors from `details`. |
| 401 | `AUTHENTICATION_REQUIRED`, `INVALID_AUTH_TOKEN` | Obtain a valid integration token. |
| 403 | `INTEGRATION_SCOPE_REQUIRED`, `INTEGRATION_IDENTITY_INACTIVE` | Check integration scope/account access. |
| 403 | `ORGANIZATION_MEMBERSHIP_REQUIRED`, `INSUFFICIENT_ORGANIZATION_ROLE` | Sender needs survey management permission. |
| 404 | `SURVEY_NOT_FOUND` | Survey is missing or deleted. |
| 409 | `INVITATION_ALREADY_COMPLETED` | Already submitted; no email sent. Refresh completion status. |
| 409 | `SURVEY_INVITE_ONLY_REQUIRED` | This endpoint requires an invite-only survey. |
| 409 | `SURVEY_CLOSED`, `SURVEY_NOT_OPEN_YET`, `SURVEY_NOT_PUBLISHED` | Survey is not currently accepting this invitation flow. |
| 409 | `SURVEY_NOT_ACCEPTING_RESPONSES` | Survey response limit reached. |
| 429 | `FORBIDDEN` | Rate limit reached; wait before another request. |
| 502 | `INVITATION_SEND_FAILED` | Email sending failed; display message. |
| 500/503 | Other server/configuration errors | Show a generic failure and retain request ID. |

Repeated successful calls intentionally send reminders. This endpoint does not deduplicate retries by an idempotency key. After a network timeout or ambiguous server failure, check completion/email history before retrying: the provider may already have accepted the email.

```ts
const response = await fetch(`${surveyBaseUrl}/api/v1/integrations/survey-invitations/send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${integrationToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ surveyId, email })
});
const payload = await response.json();
if (!response.ok || !payload.success) {
  showMessage(payload.error?.message ?? "Unable to send the survey email.");
  // payload.error?.code controls application logic.
  // payload.error?.details contains validation issues when code === "VALIDATION_ERROR".
} else {
  showMessage(payload.message);
}
```
