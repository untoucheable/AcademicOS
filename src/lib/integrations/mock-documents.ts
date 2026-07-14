import { ingestDocumentWithReview } from "@/lib/intake-pipeline";
import { StudentState } from "@/lib/student-state";

const confidence = {
  score: 0.95,
  reason: "Imported from mock cloud document.",
  needsConfirmation: false,
};

export function importMockDocument(state: StudentState, currentTime: string) {
  return ingestDocumentWithReview(state, {
    title: "Biology Chapter 5 Genetics Notes",
    type: "notes",
    subject: "Biology",
    content:
      "Key ideas: DNA, genes, alleles, dominant and recessive traits, Punnett squares, genotype, phenotype, heredity patterns.",
    tags: ["genetics", "punnett squares", "biology"],
    source: {
      provider: "google-drive",
      externalId: "mock-biology-chapter-5-notes",
      url: "https://drive.example/mock-biology-notes",
      importedAt: currentTime,
      lastSyncedAt: currentTime,
      confidence,
    },
  }).state;
}
