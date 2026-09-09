# Bulk survey completion status

`POST /api/v1/integrations/survey-completion-status`

Use the existing integration bearer JWT and required integration scope. The integration identity must be approved and have survey read permission in the survey's organization.

```json
{
  "surveyId": "550e8400-e29b-41d4-a716-446655440000",
  "emails": ["alice@example.com", "bob@example.com"]
}
```

Accepts 1–500 valid email addresses. Addresses are trimmed, lowercased, and deduplicated; results preserve first-occurrence order. Invalid input returns 400 through the standard validation middleware.

The standard success envelope contains:

```json
{
  "success": true,
  "message": "Survey completion status fetched successfully.",
  "data": {
    "surveyId": "550e8400-e29b-41d4-a716-446655440000",
    "results": [
      {
        "email": "alice@example.com",
        "hasSubmitted": true,
        "completedAt": "2026-09-09T14:30:00.000Z",
        "hasInvitationEmailBeenSent": true,
        "lastInvitationEmailSentAt": "2026-09-08T18:30:00.000Z"
      },
      {
        "email": "bob@example.com",
        "hasSubmitted": false,
        "completedAt": null,
        "hasInvitationEmailBeenSent": false,
        "lastInvitationEmailSentAt": null
      }
    ]
  },
  "meta": { "requestId": null }
}
```

- Completion is the earliest submitted response linked to this survey's invitations for the email, across survey versions. Drafts do not count.
- Email history is scoped to this survey. A recorded `sent_at` means the provider accepted a send; it does not prove inbox delivery. Later bounces do not erase the historical send.
- Missing invitations return false/null. Anonymous responses and email values within survey answers are not matched.
- Timestamps are ISO 8601 UTC. Clients can display them using `America/Toronto`.
- Closed surveys remain queryable; missing/deleted surveys return 404. Unauthorized access follows existing integration authentication and organization permission errors.
- This endpoint only reads history. It does not create links or send emails.

The successful request path uses two database queries: one parameterized LEFT JOIN lookup for the integration account, survey, and membership, followed by one batch query over email hashes. Existing role permission checks and distinct inactive-account, missing-survey, and missing-membership errors are preserved. Submission and send aggregates are separate to prevent join multiplication. Existing survey/email-hash and invitation foreign-key indexes support lookup; no migration is needed. Actual latency depends on database/network conditions and should be measured on the deployment.
