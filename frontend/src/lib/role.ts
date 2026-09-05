import { useState } from "react";

// Stands in for real auth/permissions: a per-browser role the reviewer picks
// to preview what each seniority sees. Only senior partners get the
// upload-a-change entry point and can accept or reject a suggested redline.
export type Role = "associate" | "senior_partner";

const STORAGE_KEY = "panopticon-role";

export const ROLE_LABEL: Record<Role, string> = {
  associate: "Associate",
  senior_partner: "Senior Partner",
};

function isRole(value: string | null): value is Role {
  return value === "associate" || value === "senior_partner";
}

export function useRole(): [Role, (role: Role) => void] {
  const [role, setRoleState] = useState<Role>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isRole(stored)) return stored;
    } catch {
      // storage unavailable — fall back to the default role
    }
    return "associate";
  });

  function setRole(next: Role) {
    setRoleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — local state still updates
    }
  }

  return [role, setRole];
}
