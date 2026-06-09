import { sanitizeText } from "@/lib/input";
import { MINING_TICKET_CATEGORY_SET, type MiningTicketCategory } from "@/lib/triage-categories";

const PRIORITY_SET = new Set(["low", "medium", "high", "urgent"]);

export function cleanText(value: unknown, fallback = "") {
  if (typeof value === "string") {
    const compact = sanitizeText(value, { allowNewlines: false });

    return compact || fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value == null) {
    return fallback;
  }

  try {
    const serialized = JSON.stringify(value);

    return serialized ? sanitizeText(serialized, { allowNewlines: false }) || fallback : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSlug(value: unknown, fallback: string) {
  const compact = cleanText(value, fallback).toLowerCase();
  const slug = compact.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return slug || fallback;
}

function extractLocation(rawText: string) {
  const match = rawText.match(/(?:at|near|around)\s+((?:shaft|pit|plant|site|level|conveyor|workshop|station|area|ramp|portal)\b[^,.\n]*)/i);

  return match?.[1]?.trim() ?? "";
}

function appendLocation(title: string, rawText: string) {
  const location = extractLocation(rawText);

  if (!location) {
    return title;
  }

  return `${title} at ${location}`;
}

export function inferSubjectFromRawText(rawText: string) {
  const compact = cleanText(rawText, "").toLowerCase();

  if (/hydraulic|braking|brake|smoke|haul truck|truck|vehicle|leak/.test(compact)) {
    return appendLocation("Hydraulic leak and braking loss", rawText);
  }

  if (/safety|injur|accident|near miss|hazard|fire|rescue|evacuat/.test(compact)) {
    return appendLocation("Safety incident", rawText);
  }

  if (/power|electrical|electric|voltage|breaker|substation|generator|blackout|outage/.test(compact)) {
    return appendLocation("Electrical outage", rawText);
  }

  if (/water|dewater|dewatering|flood|pumping|pump station|inundation/.test(compact)) {
    return appendLocation("Water or dewatering issue", rawText);
  }

  if (/account|profile|settings|login|password|auth/.test(compact)) {
    return "Account access issue";
  }

  if (/it|system|network|portal|app|software|computer|email|vpn|server|database/.test(compact)) {
    return "IT system issue";
  }

  return appendLocation("Operational incident", rawText);
}

function isMiningTicketCategory(value: string): value is MiningTicketCategory {
  return MINING_TICKET_CATEGORY_SET.has(value as MiningTicketCategory);
}

export function normalizeCategory(value: unknown) {
  const compact = cleanText(value, "general").toLowerCase();

  if (/billing|invoice|payment|charge|refund/.test(compact)) return "billing";
  if (/safety|injur|accident|near miss|hazard|spill|fire|fatal|rescue/.test(compact)) return "safety_incident";
  if (/maintenance|repair|service|servicing|work order|spare part|replacement/.test(compact)) return "maintenance_request";
  if (/equipment|machine|crusher|conveyor|pump|drill|excavator|haul truck|truck|vehicle|breakdown|fault|mechanical/.test(compact)) return "equipment_fault";
  if (/production|output|downtime|shutdown|stoppage|delay|lost tonnes|lost production/.test(compact)) return "production_delay";
  if (/blast|blasting|explosive|detonat/.test(compact)) return "blasting_operations";
  if (/geology|geotech|geotechnical|slope|pit wall|ground control|strata|rock fall/.test(compact)) return "geology_geotechnical";
  if (/ventilation|air quality|dust|fume|gas|oxygen|vent /.test(compact) || /ventilation/.test(compact)) return "ventilation_air_quality";
  if (/power|electrical|electric|voltage|breaker|substation|generator|blackout|outage/.test(compact)) return "power_electrical";
  if (/dewater|dewatering|water|flood|pumping|pump station|inundation/.test(compact)) return "water_dewatering";
  if (/logistics|transport|haul|fleet|road|delivery|dispatch|shipping/.test(compact)) return "logistics_transport";
  if (/procurement|purchase|po\b|inventory|stock|supply|fuel|spares?|materials|warehouse/.test(compact)) return "procurement_supply_chain";
  if (/access control|gate|badge|turnstile|visitor|entry permit|security gate/.test(compact)) return "access_control";
  if (/compliance|audit|permit|inspection|regulatory|certificate|reporting/.test(compact)) return "compliance_audit";
  if (/environmental|spill|pollution|waste|tailings|emission|effluent/.test(compact)) return "environmental_incident";
  if (/hr|payroll|leave|roster|staffing|recruitment|disciplinary|training/.test(compact)) return "hr_operations";
  if (/it|system|network|portal|app|software|computer|email|vpn|server|database/.test(compact)) return "it_system";
  if (/account|profile|settings|access|login|sign in|signin|password|auth/.test(compact)) return "account_access";
  if (/security|theft|intrusion|unauthor|burglary|trespass|violence/.test(compact)) return "security";
  if (/account|profile|settings/.test(compact)) return "account_access";
  if (/access|login|sign in|signin|password|auth/.test(compact)) return "account_access";
  if (/bug|error|crash|defect|broken|failure/.test(compact)) return "bug_report";
  if (/feature|enhancement|request/.test(compact)) return "feature_request";
  if (/security|vulnerab|breach/.test(compact)) return "security";
  if (/technical|performance|outage|service|incident/.test(compact)) return "technical_issue";

  const slug = normalizeSlug(compact, "general");

  return isMiningTicketCategory(slug) ? slug : "general";
}

export function inferCategoryFromRawText(rawText: string) {
  const compact = cleanText(rawText, "").toLowerCase();

  if (/safety|injur|accident|near miss|hazard|fire|rescue|evacuat/.test(compact)) return "safety_incident";
  if (/equipment|truck|haul truck|crusher|conveyor|pump|drill|excavator|vehicle|fault|breakdown|hydraulic|brake|braking|leak|smoke|motor|gearbox|hydraulic/.test(compact)) {
    return "equipment_fault";
  }
  if (/maintenance team|work order|repair|service|replace|spare part|servicing/.test(compact)) return "maintenance_request";
  if (/production|delayed|downtime|shutdown|stoppage|output|lost production/.test(compact)) return "production_delay";
  if (/blast|blasting|explosive|detonat/.test(compact)) return "blasting_operations";
  if (/geology|geotech|slope|pit wall|ground control|strata|rock fall/.test(compact)) return "geology_geotechnical";
  if (/ventilation|air quality|dust|fume|gas|oxygen/.test(compact)) return "ventilation_air_quality";
  if (/power|electrical|electric|voltage|breaker|substation|generator|blackout|outage/.test(compact)) return "power_electrical";
  if (/water|dewater|dewatering|flood|pumping|pump station|inundation/.test(compact)) return "water_dewatering";
  if (/logistics|transport|haul|fleet|road|delivery|dispatch|shipping/.test(compact)) return "logistics_transport";
  if (/procurement|purchase|po\b|inventory|stock|supply|fuel|spares?|materials|warehouse/.test(compact)) return "procurement_supply_chain";
  if (/access control|gate|badge|turnstile|visitor|entry permit/.test(compact)) return "access_control";
  if (/compliance|audit|permit|inspection|regulatory|certificate|reporting/.test(compact)) return "compliance_audit";
  if (/environmental|spill|pollution|waste|tailings|emission|effluent/.test(compact)) return "environmental_incident";
  if (/hr|payroll|leave|roster|staffing|recruitment|disciplinary|training/.test(compact)) return "hr_operations";
  if (/it|system|network|portal|app|software|computer|email|vpn|server|database/.test(compact)) return "it_system";
  if (/account|profile|settings|login|password|auth/.test(compact)) return "account_access";
  if (/security|theft|intrusion|unauthor|burglary|trespass|violence/.test(compact)) return "security";
  if (/billing|invoice|payment|charge|refund/.test(compact)) return "billing";

  return "technical_issue";
}

export function normalizePriority(value: unknown) {
  const compact = cleanText(value, "medium").toLowerCase();

  if (/urgent|critical|blocker|sev[_\s-]?1|p1/.test(compact)) return "urgent";
  if (/high|major|sev[_\s-]?2|p2/.test(compact)) return "high";
  if (/low|minor|sev[_\s-]?4|p4/.test(compact)) return "low";
  if (/medium|normal|moderate|sev[_\s-]?3|p3/.test(compact)) return "medium";

  const slug = normalizeSlug(compact, "medium");

  return PRIORITY_SET.has(slug) ? slug : "medium";
}

export function inferPriorityFromRawText(rawText: string) {
  const compact = cleanText(rawText, "").toLowerCase();

  if (/fatal|injur|fire|smoke|rescue|evacuat|stopped equipment|out of service|braking loss|lost braking|immediate|urgent|critical/.test(compact)) {
    return "urgent";
  }

  if (/safety|equipment|fault|breakdown|hydraulic|leak|production delayed|production delay|downtime|shutdown|stoppage|near miss|hazard/.test(compact)) {
    return "high";
  }

  if (/minor|informational|question|request|follow up/.test(compact)) {
    return "low";
  }

  return "medium";
}

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function normalizeTicketStatus(value: unknown, fallback: TicketStatus = "open"): TicketStatus {
  if (typeof value !== "string") {
    return fallback;
  }

  const compact = value.toLowerCase().replace(/\s+/g, "_").trim();

  if (compact === "open") return "open";
  if (compact === "in_progress" || compact === "in-progress" || compact === "in progress") {
    return "in_progress";
  }
  if (compact === "resolved") return "resolved";
  if (compact === "closed") return "closed";

  return fallback;
}