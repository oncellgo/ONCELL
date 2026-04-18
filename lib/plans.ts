// Plan definitions and limits.
// Keep this file as the single source of truth for what each plan includes.

export type PlanKey = 'free' | 'plus' | 'church';

export type PlanLimits = {
  label: string;                 // Human-readable name
  members: number;               // Max active members in community (Infinity = unlimited)
  recurrenceMax: number;         // Max recurring worship services per series
  imageStorageMB: number;        // Total image upload allowance (MB)
  monthlyAiChars: number;        // Monthly AI translation char allowance (refilled)
  templatesMax: number;          // Max worship bulletin templates
  features: {
    designBulkApply: boolean;
    pdfExport: boolean;
    customBackground: boolean;
    multipleAdmins: boolean;
    analytics: boolean;
    multiCommunity: boolean;
    prioritySupport: boolean;
  };
};

export const PLANS: Record<PlanKey, PlanLimits> = {
  free: {
    label: 'Free',
    members: 50,
    recurrenceMax: 13,
    imageStorageMB: 10,
    monthlyAiChars: 10_000,
    templatesMax: 1,
    features: {
      designBulkApply: false,
      pdfExport: false,
      customBackground: false,
      multipleAdmins: false,
      analytics: false,
      multiCommunity: false,
      prioritySupport: false,
    },
  },
  plus: {
    label: 'Plus',
    members: Infinity,
    recurrenceMax: 52,
    imageStorageMB: 200,
    monthlyAiChars: 500_000,
    templatesMax: 5,
    features: {
      designBulkApply: true,
      pdfExport: true,
      customBackground: true,
      multipleAdmins: false,
      analytics: false,
      multiCommunity: false,
      prioritySupport: false,
    },
  },
  church: {
    label: 'Church',
    members: Infinity,
    recurrenceMax: 52,
    imageStorageMB: 2000,
    monthlyAiChars: 5_000_000,
    templatesMax: Infinity,
    features: {
      designBulkApply: true,
      pdfExport: true,
      customBackground: true,
      multipleAdmins: true,
      analytics: true,
      multiCommunity: true,
      prioritySupport: true,
    },
  },
};

export const DEFAULT_PLAN: PlanKey = 'free';

export const getPlanLimits = (plan: PlanKey | undefined): PlanLimits =>
  PLANS[plan && PLANS[plan] ? plan : DEFAULT_PLAN];

// Master switch. When false, usage is logged but limits are NOT enforced.
// Flip to true (via env or config) when monetization is ready.
export const ENFORCE_CREDIT_LIMITS = false;
