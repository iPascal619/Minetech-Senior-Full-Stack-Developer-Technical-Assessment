import { inferCategoryFromRawText, inferPriorityFromRawText, inferSubjectFromRawText } from "@/lib/normalization";

describe("triage scenarios", () => {
  test.each([
    {
      name: "haul truck hydraulic fault",
      rawText:
        "At 06:40 this morning at Shaft B2, the main haul truck operator reported a hydraulic leak near the rear lift assembly. The vehicle was taken out of service after the operator noticed reduced braking response and smoke from the right wheel area. No injuries were reported, but production was delayed for 2 hours while the maintenance team inspected the truck. The operator on duty was James Mutua.",
      expectedCategory: "equipment_fault",
      expectedPriority: "urgent",
      expectedSubject: "Hydraulic leak and braking loss at Shaft B2",
    },
    {
      name: "conveyor near miss",
      rawText:
        "A worker reported a near miss after slipping on the conveyor walkway during the night shift. The area should be inspected and made safe before the next crew arrives.",
      expectedCategory: "safety_incident",
      expectedPriority: "high",
      expectedSubject: "Safety incident at conveyor walkway",
    },
    {
      name: "power outage",
      rawText:
        "The processing plant lost power during the afternoon shift and the breaker did not reset. Production is paused until electrical maintenance restores supply.",
      expectedCategory: "power_electrical",
      expectedPriority: "high",
      expectedSubject: "Electrical outage at processing plant",
    },
    {
      name: "dewatering pump failure",
      rawText:
        "The north pit dewatering pump stopped working and water levels are rising near the access road. The area should be checked and the pump repaired before operations continue.",
      expectedCategory: "water_dewatering",
      expectedPriority: "high",
      expectedSubject: "Water or dewatering issue at north pit",
    },
  ])("$name", ({ rawText, expectedCategory, expectedPriority, expectedSubject }) => {
    expect(inferCategoryFromRawText(rawText)).toBe(expectedCategory);
    expect(inferPriorityFromRawText(rawText)).toBe(expectedPriority);
    expect(inferSubjectFromRawText(rawText)).toBe(expectedSubject);
  });
});
