export type MoistureScale = "percent_moisture_content" | "wood_moisture_equivalent" | "comparative" | "unknown";

export type MoistureDescription =
  | { status: "ok"; label: string; isMoistureContent: boolean }
  | { status: "not_computable"; reason: "comparative_scale" | "unknown_scale" | "invalid_value"; label: string };

/**
 * How a meter number may be described. A comparative or unknown scale is never turned into percent moisture content.
 * A wood moisture equivalent is reported as that, not as actual material moisture content.
 */
export function describeMoisture(value: number, scale: MoistureScale): MoistureDescription {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return { status: "not_computable", reason: "invalid_value", label: "meter reading is not a valid number" };
  switch (scale) {
    case "percent_moisture_content":
      return { status: "ok", label: `${value} percent moisture content (as reported)`, isMoistureContent: true };
    case "wood_moisture_equivalent":
      return { status: "ok", label: `${value} wood moisture equivalent (not actual material moisture content)`, isMoistureContent: false };
    case "comparative":
      return { status: "not_computable", reason: "comparative_scale", label: `meter reading ${value} (comparative scale; no conversion to moisture content)` };
    default:
      return { status: "not_computable", reason: "unknown_scale", label: `meter reading ${value} (scale not stated)` };
  }
}
