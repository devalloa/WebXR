import { describe, expect, it } from "vitest";
import { personalOffsetHours, scheduleFor } from "./schedule";

describe("schedule", () => {
  it("suit la journée type pour un sim sans décalage", () => {
    const id = "x";
    const off = personalOffsetHours(id);
    expect(scheduleFor(id, 3 + off).place).toBe("home");
    expect(scheduleFor(id, 8 + off).place).toBe("plaza");
    expect(scheduleFor(id, 12 + off).activity).toBe("work");
    expect(scheduleFor(id, 18 + off).activity).toBe("leisure");
    expect(scheduleFor(id, 22 + off).place).toBe("home");
  });

  it("est stable et borné pour le décalage personnel", () => {
    for (const id of ["lea", "noah", "ines", "malik", "sofia", "theo"]) {
      const a = personalOffsetHours(id);
      expect(a).toBe(personalOffsetHours(id));
      expect(Math.abs(a)).toBeLessThanOrEqual(1);
    }
  });

  it("accepte les heures fractionnaires et refuse les valeurs invalides", () => {
    expect(scheduleFor("lea", 23.99).place).toBeDefined();
    expect(() => scheduleFor("lea", Number.NaN)).toThrow(RangeError);
  });
});
