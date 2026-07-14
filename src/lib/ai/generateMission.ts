import type { DailyMission } from "@/lib/types";

export function generateMission(input: string): DailyMission {
  const lower = input.toLowerCase();

  let energy: "high" | "medium" | "low" = "medium";

  if (lower.includes("tired") || lower.includes("burnt out")) {
    energy = "low";
  }

  return {
    energyLevel: energy,
    focusScore: energy === "low" ? 4 : energy === "medium" ? 6 : 8,
    expectedFinishTime: energy === "low" ? "6:30 PM" : "7:15 PM",
    summary:
      energy === "low"
        ? "Reduced workload due to low energy state"
        : "Balanced workload optimized for performance",

    riskOfBurnout: energy === "low" ? 7 : energy === "medium" ? 4 : 2,

    plan: [
      {
        id: "1",
        title: "Math Review",
        subject: "Math",
        estimatedMinutes: energy === "low" ? 20 : 45,
        priority: 1,
        reason: "Core subject affecting overall average",
        impactOnGrade: 9,
        urgency: 8,
        difficulty: 7,
        energyRequired: "high",
      },
      {
        id: "2",
        title: "Biology Review",
        subject: "Biology",
        estimatedMinutes: 25,
        priority: 2,
        reason: "Reinforces recent material",
        impactOnGrade: 7,
        urgency: 6,
        difficulty: 5,
        energyRequired: "medium",
      },
    ],
  };
}

