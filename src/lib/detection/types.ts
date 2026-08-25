import { SyntheticRecord } from "@/lib/data/schema";

export interface DetectionSignal {
  category: SyntheticRecord["type"];
  subcategory: string;
  confidence: number;
}

export type DetectionRoute =
  | "intervene"
  | "escalate"
  | "skip"
  | "no_action";

export interface DetectionResult {
  record_id: string;
  detected_category: string;
  detected_subcategory: string;
  detection_confidence: number;
  urgency_score: number;
  feasible: boolean;
  feasibility_reason: string;
  route: DetectionRoute;
  route_reason: string;
}

export const CONFIDENCE_INTERVENE = 0.7;
export const CONFIDENCE_ESCALATE = 0.4;
