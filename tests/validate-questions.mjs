import { allQuestions, domainOrder, scenarioQuestions, systemsQuestions } from "../js/questions.js";

const errors = [];
const ids = new Set();

if (systemsQuestions.length !== 59) errors.push(`Expected 59 system questions, found ${systemsQuestions.length}.`);
if (scenarioQuestions.length !== 59) errors.push(`Expected 59 scenario questions, found ${scenarioQuestions.length}.`);
if (allQuestions.length !== 118) errors.push(`Expected 118 total questions, found ${allQuestions.length}.`);

for (const question of allQuestions) {
  if (ids.has(question.id)) errors.push(`Duplicate question ID: ${question.id}`);
  ids.add(question.id);
  if (!domainOrder.includes(question.domain)) errors.push(`${question.id} has an unknown domain.`);
  if (!["Foundation", "Intermediate", "Advanced"].includes(question.difficulty)) errors.push(`${question.id} has an invalid difficulty.`);
  if (!Array.isArray(question.options) || question.options.length !== 4) errors.push(`${question.id} must have four choices.`);
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) errors.push(`${question.id} has an invalid answer key.`);
  if (!question.prompt || !question.rationale) errors.push(`${question.id} is missing teaching content.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${systemsQuestions.length} system + ${scenarioQuestions.length} scenario questions (${allQuestions.length} total).`);
