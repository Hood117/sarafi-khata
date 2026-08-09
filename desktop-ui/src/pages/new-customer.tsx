import { Navigate } from "react-router-dom";

/** Legacy route — new customer opens as a modal on the list. */
export function NewCustomerPage() {
  return <Navigate to="/customers?new=1" replace />;
}
