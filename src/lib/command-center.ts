export type AcademicCommandType =
  | "question"
  | "assignment.created"
  | "assignment.updated"
  | "assignment.completed"
  | "calendar.event.created"
  | "calendar.event.updated"
  | "grade.recorded"
  | "document.imported"
  | "integration.synced"
  | "status.energy.updated"
  | "mission.regeneration.requested";

export type AcademicCommand = {
  type: AcademicCommandType;
  input: string;
  reason: string;
  confidence: number;
};

export function classifyAcademicMessage(input: string): AcademicCommand {
  const text = input.trim().toLowerCase();

  if (!text) {
    return {
      type: "question",
      input,
      reason: "Empty input",
      confidence: 0,
    };
  }

  if (/(finished|completed|done with)/.test(text)) {
    return { type: "assignment.completed", input, reason: "Completion language detected", confidence: 0.9 };
  }
  if (/(moved|changed deadline|new due date)/.test(text)) {
    return { type: "assignment.updated", input, reason: "Deadline update language detected", confidence: 0.8 };
  }
  if (/(test|quiz|assignment|homework|essay|project)/.test(text) && /(added|imported|due|from)/.test(text)) {
    return { type: "assignment.created", input, reason: "Assignment language detected", confidence: 0.75 };
  }
  if (/(tired|exhausted|burnt out|burned out|low energy|overwhelmed|stressed)/.test(text)) {
    return { type: "status.energy.updated", input, reason: "Energy update language detected", confidence: 0.95 };
  }
  if (/(grade|percent|%|score)/.test(text)) {
    return { type: "grade.recorded", input, reason: "Grade language detected", confidence: 0.7 };
  }
  if (/(calendar|schedule|soccer|practice|game|appointment|class)/.test(text)) {
    return { type: "calendar.event.created", input, reason: "Event language detected", confidence: 0.7 };
  }

  return {
    type: "question",
    input,
    reason: "Defaulted to question",
    confidence: 0.5,
  };
}

export function createCommandReason(command: AcademicCommand) {
  return `${command.type}: ${command.reason}`;
}
