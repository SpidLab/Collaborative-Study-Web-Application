// Display wording for the agriculture demo.
//
// The server and the site agents still store and match on the original internal
// names (experiment type "GWAS", QC methods such as "Minor Allele Frequency (MAF)"),
// so every workflow behaves exactly as before. These helpers change only what the
// user sees.

export const APP_TITLE = 'Digital Agriculture Collaboration Sandbox';

const EXPERIMENT_LABELS = {
  GWAS: 'Association Study',
};

export const experimentLabel = (type) => EXPERIMENT_LABELS[type] || type;

// The federated-learning demo data labels samples with five group codes. They are
// shown as neutral region names; the stored labels and the models are unchanged.
const CLASS_LABELS = {
  EUR: 'Region A',
  AFR: 'Region B',
  EAS: 'Region C',
  SAS: 'Region D',
  AMR: 'Region E',
};

export const classLabel = (name) => CLASS_LABELS[String(name)] || name;

// Internal QC method name -> name shown in the demo.
const QC_LABELS = {
  'Sample Relatedness': 'Related Records Check',
  'Population Stratification': 'Stratification Check (PCA)',
  'Population Stratification (PCA)': 'Stratification Check (PCA)',
  'Minor Allele Frequency (MAF)': 'Low-Variability Filter',
  'Hardy-Weinberg Equilibrium (HWE)': 'Equilibrium Check',
  'Missing Data QC': 'Missing Data Filter',
};

// Kinship (sample relatedness) and Hardy-Weinberg equilibrium are not offered in
// the demo; existing collaborations that used them still display correctly.
export const isHiddenQcMethod = (name) =>
  /^(Sample Relatedness|Hardy-Weinberg)/i.test(String(name ?? ''));

// Exact phrases first, then single words. Order matters.
const TEXT_RULES = [
  [/Genotype\s*→\s*super-population classification/gi, 'Multi-site classification'],
  [/GenoPhenoCNN \(1D CNN \+ MLP classifier head\)/g, '1D CNN + MLP classifier'],
  [/GenoPhenoCNN/g, '1D CNN classifier'],
  [/Population Stratification \(PCA\)/g, 'Stratification Check (PCA)'],
  [/Population Stratification/g, 'Stratification Check (PCA)'],
  [/Minor Allele Frequency \(MAF\)/g, 'Low-Variability Filter'],
  [/Minor Allele Frequency/g, 'Low-Variability Filter'],
  [/Hardy-Weinberg Equilibrium \(HWE\)/g, 'Equilibrium Check'],
  [/Hardy-Weinberg Equilibrium/g, 'Equilibrium Check'],
  [/Sample Relatedness/g, 'Related Records Check'],
  [/Missing Data QC/g, 'Missing Data Filter'],
  [/\bGWAS\b/g, 'Association Study'],
  [/\bSNPs\b/gi, 'attributes'],
  [/\bSNP\b/gi, 'attribute'],
  [/\bgenotypes\b/gi, 'records'],
  [/\bgenotype\b/gi, 'data'],
  [/\bgenomic\b/gi, 'farm'],
  [/\bphenotypes\b/gi, 'traits'],
  [/\bphenotype\b/gi, 'trait'],
  [/\bmarkers\b/gi, 'attributes'],
  [/\bmarker\b/gi, 'attribute'],
];

const startsSentence = (whole, offset) =>
  offset === 0 || /[.!?:]\s*$/.test(whole.slice(0, offset));

// Keep the replacement's case in line with where it lands: capitalised at the start
// of a sentence, lower case when the original word was lower case.
const fitCase = (match, replacement, offset, whole) => {
  if (startsSentence(whole, offset)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  if (match === match.toLowerCase()) return replacement.toLowerCase();
  return replacement;
};

// Relabel free text that comes from the server: status and error messages, dataset
// names that carry a QC method suffix, model descriptions.
export const relabel = (text) => {
  if (typeof text !== 'string' || !text) return text;
  return TEXT_RULES.reduce(
    (out, [pattern, replacement]) =>
      out.replace(pattern, (match, ...rest) => {
        const whole = rest[rest.length - 1];
        const offset = rest[rest.length - 2];
        return fitCase(match, replacement, offset, whole);
      }),
    text,
  );
};

export const qcLabel = (name) => {
  const text = String(name ?? '');
  return QC_LABELS[text] || relabel(text);
};

// Dataset names are typed by users, so only the QC method suffix the server adds
// (e.g. "Crop Yield (Minor Allele Frequency (MAF))") is renamed.
export const datasetLabel = (name) => {
  if (typeof name !== 'string' || !name) return name;
  return Object.entries(QC_LABELS)
    .sort(([a], [b]) => b.length - a.length)
    .reduce((out, [internal, shown]) => out.split(internal).join(shown), name);
};
