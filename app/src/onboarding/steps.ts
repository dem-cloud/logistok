import { CompanyStep } from "./steps/CompanyStep";
import FinalizeStep from "./steps/FinalizeStep";
import { IndustriesStep } from "./steps/IndustriesStep";
import { PlanStep } from "./steps/PlanStep";
import { PluginsStep } from "./steps/PluginsStep";
import { OnboardingStepKey, OnboardingStepNumber } from "./types";

export const ONBOARDING_STEPS: Record<
  OnboardingStepKey,
  OnboardingStepNumber
> = {
    company: 1,
    industries: 2,
    plan: 3,
    plugins: 4,
    finalize: 5
};

export const STEP_ROUTES: Record<
  OnboardingStepNumber,
  OnboardingStepKey
> = {
    1: 'company',
    2: 'industries',
    3: 'plan',
    4: 'plugins',
    5: 'finalize'
};

export const STEP_COMPONENTS: Record<
  OnboardingStepKey,
  React.ComponentType
> = {
    company: CompanyStep,
    industries: IndustriesStep,
    plan: PlanStep,
    plugins: PluginsStep,
    finalize: FinalizeStep
};