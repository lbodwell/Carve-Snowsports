import { expect, it } from "vitest";
import { possibleImportedStudents } from "./person-review";

it("sends exact and plausible spelling differences to human review", () => {
  const students = [
    { firstName: "Avery", lastName: "Chen" },
    { firstName: "Rowan", lastName: "Patel" },
  ];
  expect(possibleImportedStudents("CHEN, Ávery", students)).toEqual([
    students[0],
  ]);
  expect(possibleImportedStudents("Chen, Avrey", students)).toEqual([
    students[0],
  ]);
  expect(possibleImportedStudents("Chen, Rowan", students)).toEqual([]);
  expect(possibleImportedStudents("", students)).toEqual([]);
});
