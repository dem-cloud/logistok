import { ReactNode } from "react";
import { ApiResponse } from "../types/auth.types";

export type OnboardingProviderProps = {
  children: ReactNode;
};

export type OnboardingStepKey =
  | "company"
  | "industries"
  | "plan"
  | "plugins"
  | "finalize";

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5;

export interface OnboardingData {
    company: {
        name: string;
        phone: string;
        country: string;
    };
    industries: string[];
    plan: {
        id: string;
        billing: "monthly" | "yearly";
    } | null;
    plugins: string[];
    branches: number;
}

export interface OnboardingMeta {
    is_free_plan?: boolean;
}

export interface Industry {
    key: string;
    name: string;
    description: string;
    photo_url: string;
}

export interface Plugin {
    key: string;
    name: string;
    description: string;
    base_price_per_month: number;
    base_price_per_year?: number;
    photo_url: string;
    current_version?: string;
}

export interface OnboardingNextData {
    next_step: OnboardingStepNumber;
    max_step_reached: OnboardingStepNumber;
    draft_data: OnboardingData;
    meta_data: OnboardingMeta;
}

export interface OnboardingBackData {
    back_step: OnboardingStepNumber;
}

export type OnboardingNextResponse = ApiResponse<OnboardingNextData>;
export type OnboardingBackResponse = ApiResponse<OnboardingBackData>;