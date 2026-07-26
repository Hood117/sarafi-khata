export type CustomerArchiveFilter = "active" | "archived";

export type CustomerListItem = {
  id: string;
  code: string | null;
  fullName: string;
  phone: string | null;
  address: string | null;
  nationalId: string | null;
  createdAt: string;
  isActive: boolean;
  isArchived: boolean;
};

export type CustomerProfile = {
  id: string;
  code: string | null;
  fullName: string;
  phone: string | null;
  address: string | null;
  nationalId: string | null;
  notes: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};
