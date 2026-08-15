# Codex Implementation Prompt

নিচের promptটি Survey Backend repository root থেকে Codex-কে দিন।

```text
এই repository-তে "External Survey Invitation API" feature সম্পূর্ণ implement করো। কাজ শুরু করার আগে Readme/external-survey-invitation/README.md পুরোটা পড়ো এবং বর্তমান surveys, invitations, responses, respondents, auth, organizations, error handling, rate-limit ও database schema inspect করো। Existing architecture/conventions মেনে কাজ করবে।

লক্ষ্য:
একটি trusted external backend POST request-এ email ও surveyId পাঠাবে। Authenticated integration identity যাচাই করার পর backend survey existence/published/private status, caller permission এবং respondent submission status যাচাই করবে। Respondent submitted না করলে একটি working private invitation link issue করবে এবং survey title, description, submission status, invitation status ও link response-এ ফেরত দেবে। User link click করলে existing /i/:token respondent flow দিয়ে survey পূরণ করবে।

API:
POST /api/v1/integrations/survey-invitations/resolve
Authorization: Bearer <short-lived integration JWT>
Body: { "email": "...", "surveyId": "uuid" }

প্রধান requirements:
1. নতুন integrations module বানাও: validator, route, controller, service এবং integration auth middleware।
2. Email বা token URL/query/log-এ দেবে না। Request body validate ও email normalize করবে।
3. Integration JWT signature-এর সঙ্গে iss, aud, exp, sub এবং প্রয়োজনীয় scope `survey:invitation:create` verify করবে। Request body থেকে createdBy নেবে না। Config এবং .env.example update করবে। সম্ভব হলে asymmetric public-key verification support করো; repository constraints অনুযায়ী অন্য পদ্ধতি নিলে কারণ document করো।
4. JWT-এর verified sub দিয়ে active integration user lookup করবে এবং requested survey-এর organization permission যাচাই করবে। Full admin privilege ধরে নেবে না। Verified user ID-ই invitation.created_by হবে।
5. Survey exist, published, open এবং invite_only কি না verify করবে। Published version থেকেই surveyName ও surveyDescription নেবে।
6. Existing HMAC email lookup ব্যবহার করে survey+email invitation খুঁজবে। survey_responses-এ matching invitation-এর submitted response থাকলে hasSubmitted=true এবং surveyLink=null return করবে।
7. Existing invitation creation/token-generation code refactor করে একটি reusable core link-issuance operation বানাও। Email delivery flow ও external API দুটোই একই core security logic ব্যবহার করবে; logic duplicate করবে না। Existing email behavior ভাঙবে না।
8. Database raw token রাখবে না। Active unsubmitted invitation থাকলে নতুন working token issue করলেও আগে পাঠানো email link invalid করা যাবে না। প্রয়োজন হলে migration দিয়ে একই invitation-এর multiple hashed access token support করো এবং respondent token lookup backward-compatible করো। শুধু token_hash rotation করে পুরোনো link invalid কোরো না।
9. Concurrent resolve request যেন duplicate invitation তৈরি না করে—database constraint/transaction/idempotent service behavior দিয়ে নিশ্চিত করো।
10. Integration endpoint-এ rate limit এবং safe audit logging রাখো। Raw email, JWT বা invitation token log করবে না।
11. Project-এর standard API response/error format ব্যবহার করো। 400/401/403/404/409/429 cases স্পষ্ট রাখো।
12. Backend-to-backend request-এর জন্য CORS change প্রয়োজন নেই। অপ্রয়োজনে new origin allow কোরো না।
13. Unit ও integration-level tests যোগ করো: JWT validation, permission, nonexistent/unpublished/wrong-mode survey, new invitation, existing unsubmitted invitation, old ও new link validity, submitted response, concurrent requests, rate limit এবং existing email/respondent regression।
14. README-র contract implementation-এর সঙ্গে mismatch হলে code ও documentation একই change-এ synchronize করো।

Expected response shape:
{
  "surveyId": "uuid",
  "surveyName": "Employee Feedback",
  "surveyDescription": "...",
  "hasSubmitted": false,
  "invitationStatus": "pending",
  "surveyLink": "https://survey.example.com/i/secure-token"
}

Implementation শেষে:
- relevant tests, typecheck ও build চালাও;
- migration safety এবং backward compatibility যাচাই করো;
- changed files ও গুরুত্বপূর্ণ design decision সংক্ষেপে জানাও;
- কোনো test fail করলে exact failure ও কারণ বলো;
- নিজে থেকে commit/push কোরো না, যতক্ষণ না আমি আলাদাভাবে বলি।
```
