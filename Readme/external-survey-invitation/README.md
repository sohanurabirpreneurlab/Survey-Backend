# External Survey Invitation API

## ১. Feature-এর উদ্দেশ্য

একটি trusted external backend `email` ও `surveyId` পাঠাবে। Survey Backend যাচাই করবে:

- surveyটি আছে কি না;
- surveyটির published version আছে কি না;
- email holder ইতোমধ্যে survey submit করেছে কি না;
- তার জন্য usable invitation আছে কি না।

Submit করা না থাকলে backend একটি working private survey link তৈরি/issue করবে। Survey-এর নাম, description, submission status এবং private link external backend-কে response হিসেবে ফেরত দেবে। External application-এ user সেই link click করলে বর্তমান Survey App-এর `/i/:token` flow দিয়ে form-এ প্রবেশ করবে।

## ২. প্রস্তাবিত request flow

```text
External Backend
    |
    | POST email + surveyId + signed integration JWT
    v
Survey Backend Integration API
    |
    |-- JWT ও integration identity verify
    |-- survey ও published version verify
    |-- normalized email hash দিয়ে invitation/response lookup
    |
    |-- response submitted হলে link না দিয়ে status return
    |
    `-- submitted না হলে private invitation access issue
            |
            `-- survey name, description ও link return

User private link click করে
    |
    `-- Survey Frontend /i/:token
            |
            `-- existing respondent session ও response flow
```

## ৩. API contract

### Endpoint

```http
POST /api/v1/integrations/survey-invitations/resolve
Authorization: Bearer <short-lived-signed-jwt>
Content-Type: application/json
```

Email URL/query parameter-এ পাঠানো হবে না। এতে browser history, proxy log ও analytics log-এ ব্যক্তিগত তথ্য চলে যেতে পারে।

### Request body

```json
{
  "email": "respondent@example.com",
  "surveyId": "survey-uuid"
}
```

### Not submitted response

```json
{
  "surveyId": "survey-uuid",
  "surveyName": "Employee Feedback",
  "surveyDescription": "Please complete this survey",
  "hasSubmitted": false,
  "invitationStatus": "pending",
  "surveyLink": "https://survey.example.com/i/secure-token"
}
```

### Already submitted response

```json
{
  "surveyId": "survey-uuid",
  "surveyName": "Employee Feedback",
  "surveyDescription": "Please complete this survey",
  "hasSubmitted": true,
  "invitationStatus": "completed",
  "surveyLink": null
}
```

## ৪. কোন module কী দায়িত্ব নেবে

নতুন external API boundary থাকবে:

```text
src/modules/integrations/
  integration-auth.middleware.ts
  external-survey.validators.ts
  external-survey.routes.ts
  external-survey.controller.ts
  external-survey.service.ts
```

বর্তমান moduleগুলোর দায়িত্ব:

- `integrations`: external request authentication ও পুরো use-case orchestration;
- `surveys`: survey এবং published version lookup;
- `invitations`: email normalization/hash, invitation creation এবং secure link issuance;
- `responses`: email-এর invitation-এর বিপরীতে submitted response আছে কি না যাচাই;
- `respondents`: private link click করার পর বর্তমান token exchange/session flow।

Controller-এ database query বা business rule রাখা হবে না। Integration service প্রয়োজনীয় domain service/repository call করবে।

## ৫. Existing invitation service কীভাবে reuse হবে

বর্তমানে invitation creation, raw token generation, token hash save এবং Brevo email delivery একই private method-এর মধ্যে যুক্ত। এটিকে দুই ভাগে refactor করতে হবে:

```text
Core invitation access creation
    → invitation তৈরি
    → raw token তৈরি
    → token hash save
    → invitation URL return

Email invitation flow
    → core method call
    → returned URL email-এ পাঠায়

External integration flow
    → core method call
    → returned URL API response-এ পাঠায়
```

একই secure token-generation logic দুই জায়গায় duplicate করা যাবে না। Refactor-এর পর existing email invitation behavior অপরিবর্তিত থাকতে হবে।

## ৬. Existing invitation-এর গুরুত্বপূর্ণ সীমাবদ্ধতা

Database বর্তমানে raw invitation token সংরক্ষণ করে না; শুধু SHA-256 hash রাখে। তাই কোনো পুরোনো invitation lookup করা গেলেও তার original `/i/:token` link পুনরায় তৈরি করা যায় না।

প্রথম implementation-এর practical rule:

1. Submitted response থাকলে নতুন link issue করা হবে না।
2. Invitation না থাকলে existing generation process ব্যবহার করে নতুন invitation ও link তৈরি হবে।
3. Active কিন্তু unsubmitted invitation থাকলে একটি নতুন working access token issue করতে হবে।
4. নতুন token issue করার কারণে আগে পাঠানো email link যেন invalid না হয়, সেটি নিশ্চিত করতে হবে।

এই কারণে শুধু existing invitation-এর `token_hash` rotate করা recommended নয়; rotation আগের emailed link invalid করে দেবে। ভালো সমাধান হলো একই invitation-এর জন্য একাধিক hashed access token support করা, যেমন আলাদা `invitation_access_tokens` table। প্রতিটি raw token কেবল issue করার সময় response/email-এ দেওয়া হবে, database-এ শুধু hash থাকবে। নতুন external link issue করলেও আগের valid email link কাজ করবে।

যদি প্রথম release-এ token rotation বেছে নেওয়া হয়, সেটি একটি স্পষ্ট product decision হতে হবে এবং external backend সবসময় সর্বশেষ returned link ব্যবহার করবে।

## ৭. Submission check

শুধু invitation status-এর উপর নির্ভর না করে সংশ্লিষ্ট `survey_responses` record-এর `status = 'submitted'` যাচাই করা হবে। Lookup chain হবে:

```text
surveyId + normalized email hash
    → survey_invitations.id
    → survey_responses.invitation_id
    → status = submitted?
```

Invitation-এর `response_count` ও `completed` status consistency check হিসেবে ব্যবহার করা যেতে পারে।

## ৮. Integration identity এবং `created_by`

External service-এর জন্য একটি dedicated system/integration user থাকবে। এটি full administrator হওয়া বাধ্যতামূলক নয়; শুধু প্রয়োজনীয় organization/survey-এ invitation create/publish-level permission থাকবে।

JWT verification-এর পর trusted `sub` claim থেকে এই integration user ID পাওয়া যাবে:

```json
{
  "sub": "integration-user-uuid",
  "iss": "trusted-external-service",
  "aud": "survey-app",
  "scope": ["survey:invitation:create"],
  "exp": 1780000000,
  "jti": "unique-token-id"
}
```

Verified `sub` invitation-এর `created_by` হিসেবে save হবে। JWT payload encrypted ধরে নেওয়া যাবে না; signature, issuer, audience, expiry ও scope verify করাই trust-এর ভিত্তি। Request body থেকে কোনো `createdBy` গ্রহণ করা যাবে না।

Preferred authentication হলো external service-এর private key দিয়ে short-lived JWT sign এবং Survey Backend-এর public key দিয়ে verify করা। Shared-secret JWT ব্যবহার করলে secret উভয় backend-এ নিরাপদ environment variable হিসেবে রাখতে হবে।

## ৯. Authorization rules

Valid JWT পেলেই যেকোনো survey-এর invitation তৈরি করা যাবে না। Backend অবশ্যই যাচাই করবে:

- integration identity active;
- প্রয়োজনীয় scope আছে;
- requested survey exist করে;
- integration user survey-এর organization-এর authorized member;
- survey published;
- survey access mode private/invite-only;
- survey closed/archived নয়;
- response limit বা invitation limit অতিক্রম হয়নি।

## ১০. CORS

External backend-to-backend request-এ browser CORS প্রযোজ্য নয়। তাই current CORS allowlist server-to-server call আটকাবে না।

External browser সরাসরি endpoint call করলে current configuration সেটি block করবে, যদি origin `FRONTEND_URL` না হয়। এই endpoint external backend থেকেই call করা উচিত। CORS authentication বা security boundary নয়।

## ১১. Security requirements

- HTTPS ছাড়া integration endpoint expose করা যাবে না।
- JWT short-lived হবে, recommended expiry ৫ মিনিট।
- `iss`, `aud`, `exp`, `scope`, `sub` এবং প্রয়োজনে `jti` verify করতে হবে।
- Email normalize করে existing HMAC lookup hash ব্যবহার করতে হবে।
- Email log, URL বা error message-এ expose করা যাবে না।
- Integration endpoint-এ rate limit রাখতে হবে।
- Audit log-এ integration identity, survey ID, result এবং request ID রাখা হবে; raw token/email রাখা হবে না।
- API response বা raw invitation token application log-এ লেখা যাবে না।
- Error response দিয়ে কোনো arbitrary email survey submit করেছে কি না unauthenticated caller-কে জানানো যাবে না।

## ১২. Error behavior

- invalid request/JWT: `400` বা `401`;
- valid identity কিন্তু insufficient scope/permission: `403`;
- survey পাওয়া যায়নি: `404`;
- survey unpublished/closed/wrong access mode: `409`;
- rate limit exceeded: `429`;
- unexpected internal/provider failure: `500`/`502`।

একই email submitted কি না আলাদা public endpoint দিয়ে expose করা হবে না।

## ১৩. Testing checklist

- valid JWT ও valid published private survey;
- invalid signature, issuer, audience, scope ও expired JWT;
- nonexistent survey;
- unauthorized organization;
- draft, closed, archived বা public survey;
- invalid email/UUID;
- নতুন email-এর জন্য invitation ও working link;
- active unsubmitted invitation-এর জন্য নতুন working link, পুরোনো email linkও সচল;
- submitted response হলে `hasSubmitted: true` এবং `surveyLink: null`;
- expired/revoked/failed invitation behavior;
- concurrent duplicate requests-এ duplicate invitation না হওয়া;
- rate limit;
- logs-এ raw email/token না থাকা;
- existing email invitation এবং respondent form flow regression test।

## ১৪. Definition of done

- Authenticated external endpoint contract অনুযায়ী response দেয়।
- Existing invitation token generation reuse হয়; duplicate security logic নেই।
- Email invitation flow আগের মতো কাজ করে।
- External link এবং আগে পাঠানো email link উভয়ই valid থাকে।
- Submitted respondent নতুন link পায় না।
- Integration user-এর verified ID `created_by`-তে save হয়।
- Unit/integration tests এবং documentation সম্পন্ন।

