export type GradeEntry = {
    id: string;
  
    subject: string;
  
    assignmentName: string;
  
    score: number; // e.g. 85
  
    maxScore: number; // e.g. 100
  
    weight?: number; // importance in final grade
  
    date: string;
  };
  
  export type Grade = {
    subject: string;
  
    currentAverage: number;
  
    targetAverage: number;
  
    entries: GradeEntry[];
  };