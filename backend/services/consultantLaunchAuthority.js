// ARTBOOST_CONSULTANT_PUBLISHING_HISTORY_ROUTING_FIX_V17_1
// Preserve the proven launch-authority implementation while routing publishing
// status questions through the deterministic first-party Publishing History reconciler.

import * as BaseAuthority from "./consultantLaunchAuthorityBase.js";
import { buildStorePublishingActivityAnswer } from "./consultantPublishingActivity.js";

export * from "./consultantLaunchAuthorityBase.js";

function normalizePublishingFollowUp(question) {
  const q = String(question || "").trim();
  const lower = q.toLowerCase();

  // contextualConsultantQuestion() annotates short follow-ups with the inherited
  // date window. Add the missing publishing nouns only for unmistakable
  // scheduled/platform outcome follow-ups so the deterministic reconciler owns them.
  const hasInheritedWindow = /conversation date context\s*:/i.test(q);
  const outcomeLanguage = /\b(?:platform|platforms|scheduled|scheduler|automation|automations|complete|completed|successful|successfully|failed|failure|failures|skipped|outcome|outcomes)\b/i.test(q);
  const alreadyPublishing = /\b(?:post|posts|posted|posting|publish|published|publishing)\b/i.test(q);

  if (hasInheritedWindow && outcomeLanguage && !alreadyPublishing) {
    return `${q} scheduled posts publishing status`;
  }

  // Also cover explicit standalone wording such as "Did every scheduled platform
  // complete today?" without changing unrelated automation questions.
  const explicitWindow = /\b(?:today|yesterday|this\s+week|this\s+month|last\s+7\s+days|past\s+7\s+days|last\s+30\s+days|past\s+30\s+days)\b/i.test(lower);
  const scheduledPlatformOutcome = /\b(?:scheduled|scheduler|automation|automations)\b/i.test(lower) && /\b(?:platform|platforms|complete|completed|successful|successfully|failed|skipped|status)\b/i.test(lower);

  if (explicitWindow && scheduledPlatformOutcome && !alreadyPublishing) {
    return `${q} scheduled posts publishing status`;
  }

  return q;
}

export function buildConsultantOperationalAnswer(args = {}) {
  const normalizedQuestion = normalizePublishingFollowUp(args?.question);
  const publishingAnswer = buildStorePublishingActivityAnswer(
    normalizedQuestion,
    args?.accountContext
  );

  if (publishingAnswer) {
    // The publishing reconciler is intentionally deterministic: it reads the same
    // store_automation_logs/publish_result evidence used by Publishing History and
    // never substitutes lifetime totals or model inference.
    return {
      ...publishingAnswer,
      actions: Array.isArray(publishingAnswer.actions) ? publishingAnswer.actions : [],
    };
  }

  return BaseAuthority.buildConsultantOperationalAnswer(args);
}
