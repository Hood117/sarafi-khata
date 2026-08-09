"use server";

import { getHawalaFormOptions } from "@/features/hawala/services/get-hawala-form-options";

export async function loadHawalaFormOptionsAction() {
  return getHawalaFormOptions();
}
