import type { Question, QuestionOption, SurveySection, SurveyVersionDefinition } from "./survey.types";

type ModifiedItem = {
  changes: Array<{
    field: string;
    newValue: unknown;
    oldValue: unknown;
  }>;
  stableKey: string;
};

const compareSections = (fromSections: SurveySection[], toSections: SurveySection[]) => {
  const fromMap = new Map(fromSections.map((section) => [section.stableKey, section]));
  const toMap = new Map(toSections.map((section) => [section.stableKey, section]));

  const added = toSections.filter((section) => !fromMap.has(section.stableKey));
  const removed = fromSections.filter((section) => !toMap.has(section.stableKey));
  const modified: ModifiedItem[] = [];

  for (const [stableKey, toSection] of toMap.entries()) {
    const fromSection = fromMap.get(stableKey);

    if (!fromSection) {
      continue;
    }

    const changes = [];

    if (fromSection.title !== toSection.title) {
      changes.push({ field: "title", oldValue: fromSection.title, newValue: toSection.title });
    }

    if (fromSection.description !== toSection.description) {
      changes.push({
        field: "description",
        oldValue: fromSection.description,
        newValue: toSection.description
      });
    }

    if (fromSection.position !== toSection.position) {
      changes.push({ field: "position", oldValue: fromSection.position, newValue: toSection.position });
    }

    if (changes.length > 0) {
      modified.push({ stableKey, changes });
    }
  }

  return { added, modified, removed };
};

const compareQuestions = (fromQuestions: Question[], toQuestions: Question[]) => {
  const fromMap = new Map(fromQuestions.map((question) => [question.stableKey, question]));
  const toMap = new Map(toQuestions.map((question) => [question.stableKey, question]));
  const added = toQuestions.filter((question) => !fromMap.has(question.stableKey));
  const removed = fromQuestions.filter((question) => !toMap.has(question.stableKey));
  const modified: ModifiedItem[] = [];

  for (const [stableKey, toQuestion] of toMap.entries()) {
    const fromQuestion = fromMap.get(stableKey);

    if (!fromQuestion) {
      continue;
    }

    const fields: Array<keyof Pick<
      Question,
      "title" | "type" | "required" | "position" | "validation" | "settings" | "displayLogic"
    >> = ["title", "type", "required", "position", "validation", "settings", "displayLogic"];

    const changes = fields.flatMap((field) =>
      JSON.stringify(fromQuestion[field]) === JSON.stringify(toQuestion[field])
        ? []
        : [{ field, oldValue: fromQuestion[field], newValue: toQuestion[field] }]
    );

    if (changes.length > 0) {
      modified.push({ stableKey, changes });
    }
  }

  return { added, modified, removed };
};

const compareOptions = (fromOptions: QuestionOption[], toOptions: QuestionOption[]) => {
  const fromMap = new Map(fromOptions.map((option) => [option.stableKey, option]));
  const toMap = new Map(toOptions.map((option) => [option.stableKey, option]));
  const added = toOptions.filter((option) => !fromMap.has(option.stableKey));
  const removed = fromOptions.filter((option) => !toMap.has(option.stableKey));
  const modified: ModifiedItem[] = [];

  for (const [stableKey, toOption] of toMap.entries()) {
    const fromOption = fromMap.get(stableKey);

    if (!fromOption) {
      continue;
    }

    const fields: Array<keyof Pick<QuestionOption, "label" | "value" | "position" | "settings">> = [
      "label",
      "value",
      "position",
      "settings"
    ];

    const changes = fields.flatMap((field) =>
      JSON.stringify(fromOption[field]) === JSON.stringify(toOption[field])
        ? []
        : [{ field, oldValue: fromOption[field], newValue: toOption[field] }]
    );

    if (changes.length > 0) {
      modified.push({ stableKey, changes });
    }
  }

  return { added, modified, removed };
};

export const compareSurveyVersions = (
  fromDefinition: SurveyVersionDefinition,
  toDefinition: SurveyVersionDefinition
) => ({
  changes: {
    options: compareOptions(fromDefinition.options, toDefinition.options),
    questions: compareQuestions(fromDefinition.questions, toDefinition.questions),
    sections: compareSections(fromDefinition.sections, toDefinition.sections)
  },
  fromVersion: fromDefinition.version.versionNumber,
  toVersion: toDefinition.version.versionNumber
});
