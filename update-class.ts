import parse from "csv-parse/lib/sync";
import stringify from "csv-stringify/lib/sync";
import { readFileSync, writeFileSync } from "fs";
import ss from "string-similarity";
import { zip, uniq, flatten, partition, reduce } from "lodash";
import glob from "glob";

type ParentSquareCSVStudent = {
  Grade: string;
  Class: string;
  "Student Last": string;
  "Student First": string;
};

type ClarendonCSVStudent = {
  "Student Name": string;
  "Course Title": string;
  Grd: string;
  "Teacher Name": string;
  Room: string;
};

type Student = {
  lastName: string;
  firstName: string;
  class: string;
};

const gradeToOrdinalMap: { [k: string]: string } = {
  K: "K",
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5": "5th",
};

const psCSVFile = "data/input/ps_students_parents.csv";
const clarendonCSVDir = "data/input/clarendon";
const badMatchFile = "data/output/bad-matches.json";
const outputCSVFile = "data/output/new_ps_students_parents.csv";

const parseOptions = {
  columns: true,
  skip_lines_with_empty_values: true,
};

const psStudents: ParentSquareCSVStudent[] = parse(
  readFileSync(psCSVFile),
  parseOptions
);

const clarendonCSVFiles = glob.sync(`${clarendonCSVDir}/*.csv`);
const clarendonCSVStudents = flatten(
  clarendonCSVFiles.map((clarendonCSVFile) => {
    // The Clarendon files inexplicably have an extra header row. Slice it off.
    const clarendonCSVStudents: ClarendonCSVStudent[] = parse(
      readFileSync(clarendonCSVFile),
      parseOptions
    ).slice(1);

    return clarendonCSVStudents;
  })
);

const clarendonStudents: Student[] = clarendonCSVStudents.map((student) => {
  const name = student["Student Name"];
  const nameParts = name.split(",");

  const teacherLastName = student["Teacher Name"].split(",")[0];
  const room = `(Rm. ${student["Room"]})`;
  const grade = gradeToOrdinalMap[student["Grd"]];
  if (!nameParts[1]) console.log(student);
  return {
    lastName: nameParts[0],
    firstName: nameParts[1].trim().split(" ")[0],
    class: `${grade} - ${teacherLastName} ${room}`,
  };
});

const clarendonNames = clarendonStudents.map(
  (student) => `${student.firstName} ${student.lastName}`
);
const matches = psStudents.map((student) => {
  const name = `${student["Student First"].split(" ")[0]} ${
    student["Student Last"]
  }`;
  const { bestMatch, bestMatchIndex } = ss.findBestMatch(name, clarendonNames);
  return {
    name,
    bestMatch,
    bestMatchIndex,
  };
});

const [goodMatches, badMatches] = partition(
  matches,
  (match) => match.bestMatch.rating > 0.8
);

console.log(
  `good matches: ${goodMatches.length}, bad matches: ${badMatches.length}`
);

writeFileSync(badMatchFile, JSON.stringify(badMatches, undefined, 2));

const newPsStudents: ParentSquareCSVStudent[] = zip(psStudents, matches).map(
  ([psStudent, match]) => {
    if (!psStudent)
      throw new Error(`No corresponding PS student for match: ${match}`);
    if (!match)
      throw new Error(`No corresponding match for PS student: ${psStudent}`);

    return {
      ...psStudent,
      Class: clarendonStudents[match.bestMatchIndex].class,
    };
  }
);

const columns = Object.keys(newPsStudents[0]);
const outputCSV = stringify(newPsStudents, {
  columns,
  header: true,
});

writeFileSync(outputCSVFile, outputCSV);
