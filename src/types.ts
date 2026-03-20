export interface CallScore {
  introduction: number;
  needDiscovery: number;
  presentation: number;
  objectionHandling: number;
  stopWords: number;
  closing: number;
  average: number;
  feedback: string;
}

export interface FactBlocks {
  introduction: string;
  needDiscovery: string;
  presentation: string;
  objectionHandling: string;
  stopWords: string;
  closing: string;
  summary: string;
}

export interface TranscriptionTurn {
  speaker: string;
  text: string;
  timestamp?: string;
}
