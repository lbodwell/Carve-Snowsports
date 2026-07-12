export const seasonalRegistrationHeaders = [
  "Instructor",
  "Last_Name",
  "First_Name",
  "DOB",
  "Age",
  "IP_Code",
  "Day",
  "Time",
  "Discipline",
  "Level",
  "Start_Date",
  "Transaction_ID",
  "Product_Header",
  "Product_Date",
  "Total_Price",
  "Guardian_Name",
  "Address",
  "City",
  "ST",
  "Full_Name",
  "Email",
  "Phone",
  "Emergency_Contact_Name",
  "Emergency_Phone",
  "Medication",
  "FoodAllergy",
  "DrugAllergy",
  "SpecialCondition",
  "Lunch_Default",
  "Attendance",
  "Jan_3",
  "Jan_4",
  "Jan_10",
  "Jan_11",
  "Jan_24",
  "Jan_25",
  "Jan_31",
  "Feb_2",
  "Feb_7",
  "Feb_8",
  "Feb_21",
  "Feb_22",
  "Feb_28",
  "Mar_1",
  "Mar_7",
  "Mar_8",
  "Mar_14",
  "Mar_15",
  "Mar_21",
  "Mar_22",
  "Make_Up_Sat",
  "Make_Up_Sun",
  "Notes",
  "Lesson",
] as const;

export type SeasonalRegistrationPreview = {
  rowNumber: number;
  transactionId: string;
  studentName: string;
  attendance: Array<{ sourceColumn: string; rawValue: string }>;
  supportCategories: Array<string>;
  issues: Array<string>;
};

function parseCsvLine(line: string) {
  const cells: Array<string> = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("Unterminated quoted CSV field.");
  cells.push(cell.trim());
  return cells;
}

export function previewSeasonalRegistrationCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "");
  const missingHeaders = seasonalRegistrationHeaders.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length > 0) {
    return {
      valid: false as const,
      missingHeaders,
      rows: [] as Array<SeasonalRegistrationPreview>,
    };
  }

  const indexes = new Map(headers.map((header, index) => [header, index]));
  const attendanceHeaders = headers.filter((header) =>
    /^(Jan|Feb|Mar)_\d+$|^Make_Up_/.test(header),
  );
  const rows = lines.slice(1).map((line, lineIndex) => {
    const values = parseCsvLine(line);
    const value = (header: string) => values[indexes.get(header) ?? -1] ?? "";
    const supportColumns: Array<readonly [string, string]> = [
      ["Medication", "medication"],
      ["FoodAllergy", "food_allergy"],
      ["DrugAllergy", "drug_allergy"],
      ["SpecialCondition", "special_condition"],
    ];
    const supportCategories = supportColumns.flatMap(([source, category]) =>
      value(source).trim() ? [category] : [],
    );
    const issues: Array<string> = [];
    if (!value("First_Name") || !value("Last_Name"))
      issues.push("Student name is required.");
    if (!value("Transaction_ID"))
      issues.push("Transaction_ID is missing; identity must be reviewed.");

    return {
      rowNumber: lineIndex + 2,
      transactionId: value("Transaction_ID"),
      studentName: `${value("First_Name")} ${value("Last_Name")}`.trim(),
      attendance: attendanceHeaders.flatMap((header) => {
        const rawValue = value(header);
        return rawValue ? [{ sourceColumn: header, rawValue }] : [];
      }),
      supportCategories,
      issues,
    };
  });

  return { valid: true as const, missingHeaders: [], rows };
}
