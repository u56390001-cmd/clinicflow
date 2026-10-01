/**
 * Common outpatient medicines, offered as suggestions for the medicine input.
 *
 * Why a literal list rather than a drug database: this is a suggestion list for
 * a general OPD, not a formulary. The doctor is typing a drug they already know
 * they want — the list saves the keystrokes and, more usefully, the spelling, so
 * "Paracetmol" cannot end up printed on a prescription. It is not a clinical
 * decision aid and does not filter by indication or contraindication; picking a
 * drug, a dose and a duration stays the doctor's job.
 *
 * The patient's own previous medicines are merged in ahead of this list at
 * render time, so a drug they are already taking is one keystroke away and a
 * drug they have never been prescribed is not a blank field.
 *
 * Strengths are carried in the name rather than a separate column because the
 * medicine name cell is a single free-text field the doctor also types into: the
 * suggestion has to land as one string to be useful. Grouped by therapeutic
 * class purely so the list stays reviewable — the browser's own filter matches
 * on what is typed, so the order here does not change what the doctor sees.
 */

/** Analgesics, antipyretics, and non-steroidal anti-inflammatories. */
const ANALGESICS = [
  "Paracetamol 500 mg",
  "Paracetamol 650 mg",
  "Paracetamol 1 g",
  "Paracetamol + Ibuprofen",
  "Ibuprofen 200 mg",
  "Ibuprofen 400 mg",
  "Ibuprofen + Paracetamol",
  "Diclofenac Sodium 50 mg",
  "Diclofenac Diethylamine Gel 1%",
  "Aceclofenac 100 mg",
  "Aceclofenac + Paracetamol",
  "Naproxen 250 mg",
  "Aspirin 75 mg",
  "Aspirin 325 mg",
  "Celecoxib 200 mg",
  "Tramadol 50 mg",
  "Etoricoxib 90 mg",
];

/** Antibacterials — the oral ones a general OPD actually prescribes. */
const ANTIBACTERIALS = [
  "Amoxicillin 250 mg",
  "Amoxicillin 500 mg",
  "Amoxicillin + Clavulanic Acid 625 mg",
  "Azithromycin 250 mg",
  "Azithromycin 500 mg",
  "Cefixime 200 mg",
  "Cefuroxime 250 mg",
  "Cefpodoxime Proxetil 200 mg",
  "Cephalexin 250 mg",
  "Cefdinir 300 mg",
  "Ciprofloxacin 250 mg",
  "Ciprofloxacin 500 mg",
  "Levofloxacin 250 mg",
  "Ofloxacin 200 mg",
  "Moxifloxacin 400 mg",
  "Metronidazole 400 mg",
  "Tinidazole 500 mg",
  "Doxycycline 100 mg",
  "Erythromycin 250 mg",
  "Clindamycin 300 mg",
  "Co-trimoxazole 480/160 mg",
  "Fusidic Acid 250 mg",
  "Mupirocin Ointment 2%",
  "Nitrofurantoin 100 mg",
  "Ceftriaxone 1 g Injection",
  "Gentamicin 40 mg/ml Injection",
];

/** Antihistamines for allergy, hives, and the runny nose of a cold. */
const ANTIHISTAMINES = [
  "Cetirizine 5 mg",
  "Cetirizine 10 mg",
  "Levocetirizine 5 mg",
  "Loratadine 10 mg",
  "Fexofenadine 120 mg",
  "Chlorpheniramine 4 mg",
  "Promethazine 25 mg",
  "Hydroxyzine 10 mg",
];

/** Acid suppression, reflux, and the prokinetics that go with them. */
const GASTRO = [
  "Omeprazole 20 mg",
  "Omeprazole 40 mg",
  "Esomeprazole 20 mg",
  "Pantoprazole 40 mg",
  "Lansoprazole 30 mg",
  "Rabeprazole 20 mg",
  "Famotidine 20 mg",
  "Domperidone 10 mg",
  "Itopride 50 mg",
  "Metoclopramide 10 mg",
  "Ondansetron 4 mg",
  "Sucralfate 100 mg",
  "Antacid Gel (Aluminium Hydroxide + Magnesium Hydroxide)",
  "Antacid Suspension (Aluminium + Magnesium Hydroxide)",
  "Povidone Iodine Mouthwash",
  "Isabgol (Psyllium Husk)",
  "Lactulose 10 g/15 ml",
  "Senna 5 mg",
  "Bisacodyl 5 mg",
  "Loperamide 2 mg",
  "Ofloxacin + Ornidazole",
  "ORS Sachet",
  "Zinc Sulphate 20 mg Dispersible",
  "Probiotics (Enterococcus + Bacillus)",
];

/** Cough, cold, wheeze, and nasal congestion. */
const RESPIRATORY = [
  "Ambroxol 30 mg",
  "Ambroxol Syrup 30 mg/5 ml",
  "Acetylcysteine 600 mg",
  "Montelukast 5 mg",
  "Montelukast 10 mg",
  "Levocetirizine + Montelukast",
  "Salbutamol Inhaler 100 mcg",
  "Levosalbutamol Inhaler 50 mcg",
  "Budesonide Inhaler 200 mcg",
  "Budesonide + Formoterol Inhaler",
  "Ipratropium Bromide Inhaler",
  "Dextromethorphan Syrup 10 mg/5 ml",
  "Xylometazoline Nasal Drops 0.05%",
  "Fluticasone Nasal Spray",
];

/** Blood pressure, lipids, and antiplatelets. */
const CARDIOVASCULAR = [
  "Amlodipine 5 mg",
  "Amlodipine 10 mg",
  "Losartan 50 mg",
  "Telmisartan 40 mg",
  "Valsartan 80 mg",
  "Ramipril 2.5 mg",
  "Enalapril 5 mg",
  "Lisinopril 5 mg",
  "Bisoprolol 5 mg",
  "Metoprolol 25 mg",
  "Metoprolol Succinate 50 mg",
  "Atenolol 50 mg",
  "Carvedilol 6.25 mg",
  "Nebivolol 5 mg",
  "Atorvastatin 10 mg",
  "Atorvastatin 20 mg",
  "Atorvastatin 40 mg",
  "Rosuvastatin 10 mg",
  "Rosuvastatin 20 mg",
  "Clopidogrel 75 mg",
  "Isosorbide Mononitrate 30 mg",
  "Trimetazidine MR 35 mg",
  "Furosemide 40 mg",
  "Hydrochlorothiazide 12.5 mg",
  "Chlorthalidone 12.5 mg",
  "Spironolactone 25 mg",
];

/** Diabetes, including the two insulins a general practice hands out. */
const DIABETES = [
  "Metformin 500 mg",
  "Metformin 850 mg",
  "Metformin 1000 mg",
  "Glimepiride 1 mg",
  "Glimepiride 2 mg",
  "Glimepiride 3 mg",
  "Glimepiride + Metformin",
  "Sitagliptin 100 mg",
  "Vildagliptin 100 mg",
  "Dapagliflozin 10 mg",
  "Insulin Human Mixtard 30 Injection",
  "Insulin Glargine 100 IU/ml Injection",
];

/** Thyroid and the other endocrine tablets a general OPD sees weekly. */
const ENDOCRINE = [
  "Levothyroxine 25 mcg",
  "Levothyroxine 50 mcg",
  "Levothyroxine 75 mcg",
  "Levothyroxine 100 mcg",
  "Carbimazole 5 mg",
  "Propylthiouracil 50 mg",
];

/**
 * Vitamins and minerals.
 *
 * Kept because an OPD review script prescribes them constantly, and because
 * "Vitamin D" without a strength is the single most-reordered line on a
 * general prescription.
 */
const SUPPLEMENTS = [
  "Vitamin D3 (Cholecalciferol) 1000 IU",
  "Vitamin D3 (Cholecalciferol) 50000 IU",
  "Calcium Carbonate 500 mg",
  "Calcium Carbonate + Vitamin D3",
  "Ferrous Sulphate + Folic Acid",
  "Iron + Folic Acid + Vitamin B12",
  "Folic Acid 5 mg",
  "Vitamin B Complex",
  "Multivitamin",
  "Vitamin C 500 mg",
  "Zinc 20 mg",
];

/** Neuropathy, epilepsy, mood, and sleep. */
const NEUROLOGY = [
  "Gabapentin 300 mg",
  "Pregabalin 75 mg",
  "Carbamazepine 200 mg",
  "Levetiracetam 250 mg",
  "Amitriptyline 10 mg",
  "Nortriptyline 10 mg",
  "Sertraline 50 mg",
  "Escitalopram 10 mg",
  "Fluoxetine 20 mg",
  "Alprazolam 0.25 mg",
  "Lorazepam 1 mg",
  "Bromazepam 5 mg",
  "Clonazepam 0.5 mg",
  "Melatonin 3 mg",
];

/** Topicals, the eye, the prostate. */
const TOPICALS_AND_MISC = [
  "Betamethasone Cream 0.1%",
  "Clobetasol Propionate Cream 0.05%",
  "Fusidic Acid Cream 2%",
  "Ketoconazole Cream 2%",
  "Permethrin Cream 5%",
  "Silver Sulfadiazine Cream 1%",
  "Lidocaine 2% Gel",
  "Moxifloxacin Eye Drops 0.5%",
  "Ofloxacin Eye Drops 0.3%",
  "Chloramphenicol Eye Drops 0.5%",
  "Fluorometholone Eye Drops 0.1%",
  "Carboxymethylcellulose Eye Drops",
  "Tamsulosin 0.4 mg",
  "Silodosin 5 mg",
  "Finasteride 5 mg",
  "Dutasteride 0.5 mg",
  "Isotretinoin 20 mg",
  "Levocetirizine + Montelukast",
];

/**
 * Every suggestion, in the order the browser will offer them: grouped by
 * therapeutic class rather than alphabetically, so the unfiltered list still
 * reads like a formulary instead of a shuffled word list.
 *
 * Duplicates are dropped below rather than here, because the same drug appears
 * in more than one class above (levocetirizine + montelukast is an allergy drug
 * and a respiratory one) and keeping the first occurrence means the ordering
 * above stays the source of truth for what a class means.
 */
const ALL_CATEGORIES: readonly (readonly string[])[] = [
  ANALGESICS,
  ANTIBACTERIALS,
  ANTIHISTAMINES,
  GASTRO,
  RESPIRATORY,
  CARDIOVASCULAR,
  DIABETES,
  ENDOCRINE,
  SUPPLEMENTS,
  NEUROLOGY,
  TOPICALS_AND_MISC,
];

/**
 * Flattened, de-duplicated on a normalised name.
 *
 * Normalised rather than exact because "Amoxicillin 500 MG" and "Amoxicillin
 * 500 mg" are the same drug and offering both makes the list look padded.
 */
export const OPD_MEDICINE_SUGGESTIONS: readonly string[] = [
  ...new Map(
    ALL_CATEGORIES.flat().map((name) => [
      name.trim().toLowerCase(),
      name.trim(),
    ]),
  ).values(),
];
