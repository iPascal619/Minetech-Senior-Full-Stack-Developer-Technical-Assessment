export const MINING_TICKET_CATEGORIES = [
  "safety_incident",
  "equipment_fault",
  "maintenance_request",
  "production_delay",
  "blasting_operations",
  "geology_geotechnical",
  "ventilation_air_quality",
  "power_electrical",
  "water_dewatering",
  "logistics_transport",
  "procurement_supply_chain",
  "access_control",
  "compliance_audit",
  "environmental_incident",
  "hr_operations",
  "it_system",
  "account_access",
  "security",
  "billing",
  "technical_issue",
  "bug_report",
  "feature_request",
  "general",
  "other",
] as const;

export type MiningTicketCategory = (typeof MINING_TICKET_CATEGORIES)[number];

export const MINING_TICKET_CATEGORY_SET = new Set(MINING_TICKET_CATEGORIES);