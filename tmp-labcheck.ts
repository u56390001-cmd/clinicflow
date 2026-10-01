import { labPanelParameters, labTestLabel } from "./lib/lab-panels";
for (const t of ["CBC","cbc","CBC ","RFT","KFT","LFT","Lipid Profile","TSH","Dengue NS1","RBS"]) {
  const p = labPanelParameters(t);
  console.log(t.padEnd(14), p ? `${p.length} params` : "null (no gear)");
}
console.log("---labels---");
console.log(labTestLabel("CBC", []));
console.log(labTestLabel("CBC", ["Hemoglobin (Hb)"]));
console.log(labTestLabel("CBC", ["Hemoglobin (Hb)","Platelets"]));
console.log(labTestLabel("CBC", ["Hemoglobin (Hb)","TLC / DLC","Platelets","ESR","x"]));
