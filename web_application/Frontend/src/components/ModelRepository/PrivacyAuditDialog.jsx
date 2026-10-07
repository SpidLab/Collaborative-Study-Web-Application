import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Stack, Switch, Table, TableBody, TableCell, TableHead,
  TableRow, Typography,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import axios from 'axios';
import URL from '../../config';
import { relabel, classLabel } from '../Utils/demoTerms';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const pct = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const num = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');
const count = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '—');

const prettyDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// Shared with ModelCard so the chip and the dialog headline never disagree.
export const riskMeta = (level) => {
  switch (String(level || '').toLowerCase()) {
    case 'low':
      return { label: 'Low', color: '#2e7d32', bg: '#edf7ed', chip: 'success' };
    case 'moderate':
      return { label: 'Moderate', color: '#b26a00', bg: '#fff4e5', chip: 'warning' };
    case 'high':
      return { label: 'High', color: '#c62828', bg: '#fdeded', chip: 'error' };
    default:
      return { label: 'Unrated', color: '#546e7a', bg: '#f6f9fc', chip: 'default' };
  }
};

const ROC_LEFT = 44;
const ROC_TOP = 16;
const ROC_SIZE = 264;
const rx = (v) => ROC_LEFT + v * ROC_SIZE;
const ry = (v) => ROC_TOP + ROC_SIZE - v * ROC_SIZE;
const GRID = [0, 0.25, 0.5, 0.75, 1];
const TICKS = [0, 0.5, 1];

const RocCurve = ({ roc, auc, worstCase, accent }) => {
  const points = useMemo(() => (Array.isArray(roc) ? roc : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map((p) => [
      Math.min(1, Math.max(0, Number(p[0]))),
      Math.min(1, Math.max(0, Number(p[1]))),
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]), [roc]);

  if (points.length < 2) {
    return (
      <Typography variant="body2" color="text.secondary">
        This audit did not return a curve — only the summary numbers above are available for it.
      </Typography>
    );
  }

  const d = points
    .map(([f, t], i) => `${i === 0 ? 'M' : 'L'} ${rx(f).toFixed(1)} ${ry(t).toFixed(1)}`)
    .join(' ');
  const marker = worstCase
    && Number.isFinite(Number(worstCase.fpr)) && Number.isFinite(Number(worstCase.tpr))
    ? [Number(worstCase.fpr), Number(worstCase.tpr)]
    : null;

  return (
    <Box>
      <Box sx={{ width: '100%', maxWidth: 340 }}>
        <svg
          viewBox="0 0 320 320"
          width="100%"
          role="img"
          aria-label={`ROC curve for the black-box membership attack, area under the curve ${num(auc)}`}
        >
          {GRID.map((t) => (
            <g key={`g${t}`}>
              <line x1={rx(0)} y1={ry(t)} x2={rx(1)} y2={ry(t)} stroke="#e3ebf3" strokeWidth="1" />
              <line x1={rx(t)} y1={ry(0)} x2={rx(t)} y2={ry(1)} stroke="#e3ebf3" strokeWidth="1" />
            </g>
          ))}

          <line x1={rx(0)} y1={ry(0)} x2={rx(1)} y2={ry(0)} stroke="#90a4ae" strokeWidth="1.25" />
          <line x1={rx(0)} y1={ry(0)} x2={rx(0)} y2={ry(1)} stroke="#90a4ae" strokeWidth="1.25" />
          <line
            x1={rx(0)} y1={ry(0)} x2={rx(1)} y2={ry(1)}
            stroke="#90a4ae" strokeWidth="1.5" strokeDasharray="5 4"
          />

          <path d={d} fill="none" stroke="#1976d2" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />

          {marker && (
            <circle
              cx={rx(marker[0])} cy={ry(marker[1])} r="4.5"
              fill={accent} stroke="#ffffff" strokeWidth="1.5"
            />
          )}

          {TICKS.map((t) => (
            <text key={`x${t}`} x={rx(t)} y={ry(0) + 16} textAnchor="middle" fontSize="11" fill="#6b7a8c">
              {t}
            </text>
          ))}
          {TICKS.map((t) => (
            <text key={`y${t}`} x={rx(0) - 8} y={ry(t) + 4} textAnchor="end" fontSize="11" fill="#6b7a8c">
              {t}
            </text>
          ))}

          <text x={rx(0.5)} y="314" textAnchor="middle" fontSize="12" fill="#6b7a8c">
            False-positive rate
          </text>
          <text
            x="14" y={ry(0.5)} textAnchor="middle" fontSize="12" fill="#6b7a8c"
            transform={`rotate(-90 14 ${ry(0.5)})`}
          >
            True-positive rate
          </text>
          <text x={rx(0.97)} y={ry(0.06)} textAnchor="end" fontSize="12" fontWeight="700" fill="#1976d2">
            AUC {num(auc)}
          </text>
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Solid line: the black-box attack. Dashed line: no skill — an attacker guessing at random.
        {marker ? ' The dot is the worst-case operating point described above.' : ''}
        {' '}The further the curve sits above the dashed line, the more the model tells an
        attacker about which records were in its training data.
      </Typography>
    </Box>
  );
};

const StatTile = ({ label, value, caption, accent }) => (
  <Box sx={{
    flex: 1, minWidth: 128, py: 1.25, px: 1.5, borderRadius: 2,
    bgcolor: '#f6f9fc', border: '1px solid #e3ebf3',
  }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: accent || 'primary.main', lineHeight: 1.15 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
    {caption && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {caption}
      </Typography>
    )}
  </Box>
);

const ATTACK_ROWS = [
  { key: 'attack_accuracy', label: 'Attack accuracy', fmt: (v) => pct(v), hint: 'balanced — 50% = guessing' },
  {
    key: 'weighted_accuracy',
    label: 'Raw accuracy',
    fmt: (v) => pct(v),
    // Kept for comparability with the published ART tutorial, which reports this
    // figure — but its cohort is balanced and ours is 4:1, so shown next to the
    // majority baseline rather than on its own, where it would read far too high.
    hint: 'over the real 4:1 member/non-member split — read against the baseline below',
  },
  { key: 'majority_baseline', label: 'Always-say-member baseline', fmt: (v) => pct(v), hint: 'what a zero-signal attack scores on the raw measure' },
  { key: 'member_accuracy', label: 'Members spotted', fmt: (v) => pct(v), hint: 'true members called members' },
  { key: 'non_member_accuracy', label: 'Non-members spotted', fmt: (v) => pct(v), hint: 'outsiders called outsiders' },
  { key: 'precision', label: 'Precision', fmt: (v) => num(v), hint: 'when it says "member", how often it is right' },
  { key: 'recall', label: 'Recall', fmt: (v) => num(v), hint: 'share of members it catches' },
];

const PrivacyAuditDialog = ({ open, model, onClose, onAuditChange }) => {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const modelId = model?.model_id;

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    setError('');
    try {
      const resp = await axios.get(`${URL}/api/models/${modelId}/privacy-audit`, { headers: authHeader() });
      setAudit(resp.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not load the privacy audit');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (!open) return;
    setPublishError('');
    load();
  }, [open, load]);

  const setPublished = async (published) => {
    setPublishing(true);
    setPublishError('');
    try {
      await axios.post(
        `${URL}/api/models/${modelId}/privacy-audit/publish`,
        { published },
        { headers: authHeader() },
      );
      setAudit((a) => (a ? { ...a, published } : a));
      if (onAuditChange) onAuditChange();
    } catch (err) {
      setPublishError(err?.response?.data?.error || err.message || 'Could not change who can see this result');
    } finally {
      setPublishing(false);
    }
  };

  if (!model) return null;

  const report = audit?.report || null;
  const risk = report?.risk || {};
  const meta = riskMeta(risk.level || audit?.risk_level);
  const acc = report?.model_accuracy || {};
  const cohort = report?.cohort || {};
  // The agent writes this sentence itself, and its first words say which of the two
  // routes produced the split. That distinction changes how the numbers should be read.
  const ownerDeclaredCohort = String(cohort.source || '').startsWith('owner-declared');
  const ruleBased = report?.rule_based || {};
  const blackBox = report?.black_box || {};
  const worst = blackBox.worst_case || null;
  // With n non-members the finest false-positive rate measurable is 1/n, so a 1% target
  // is unanswerable on a small held-out set. The agent says so explicitly rather than
  // returning a zero that would read as "nobody is identifiable".
  const unavailable = !worst ? (blackBox.worst_case_unavailable || null) : null;
  const perClass = Array.isArray(report?.per_class_worst_case) ? report.per_class_worst_case : [];
  const advice = Array.isArray(risk.advice) ? risk.advice : [];
  // The rating is assessed against the STRONGEST attack tried, and `risk.advantage` is
  // floored at zero, so pairing it with `black_box.attack_accuracy` can print two numbers
  // that contradict each other ("46.0% of the time … 0.0 points better than chance", or a
  // 0.62 headline alongside a 20-point advantage). Show the strongest attack and derive the
  // distance from chance from that same number, so the chip, the sentence and the rating
  // can never disagree.
  const accuracyCandidates = [
    blackBox.attack_accuracy, ruleBased.attack_accuracy, audit?.attack_accuracy,
  ].filter((v) => typeof v === 'number' && Number.isFinite(v));
  const attackAccuracy = accuracyCandidates.length ? Math.max(...accuracyCandidates) : null;
  const advantage = attackAccuracy != null ? attackAccuracy - 0.5 : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Privacy risk analysis
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          {model.name || 'Untitled model'} · membership inference audit
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Loading the audit…</Typography>
          </Stack>
        ) : error ? (
          <Alert severity="error" action={<Button size="small" onClick={load}>Retry</Button>}>
            {relabel(error)}
          </Alert>
        ) : !audit || audit.status === 'none' ? (
          <Alert severity="info">
            <AlertTitle>No audit has been run for this model</AlertTitle>
            Start one from the model card. It runs on your own Site Agent, where the model and its
            training data both live.
          </Alert>
        ) : audit.status === 'queued' || audit.status === 'running' ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              {audit.status === 'queued'
                ? 'Queued — waiting for your Site Agent to pick the job up.'
                : 'Your Site Agent is running the attacks now.'}
            </Typography>
          </Stack>
        ) : audit.status === 'failed' ? (
          <Alert severity="error">
            <AlertTitle>The audit did not finish</AlertTitle>
            {relabel(audit.error) || 'Your Site Agent could not complete the analysis.'}
          </Alert>
        ) : !report ? (
          <Alert severity="warning">
            The detailed report is not available for this audit. Re-run it from the model card to
            regenerate the breakdown.
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            <Box sx={{
              p: 2, borderRadius: 2, bgcolor: meta.bg,
              border: '1px solid', borderColor: meta.color,
            }}>
              <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                <ShieldOutlinedIcon sx={{ color: meta.color }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: meta.color }}>
                  {meta.label} privacy risk
                </Typography>
                <Chip
                  size="small"
                  label={`Strongest attack accuracy ${num(attackAccuracy, 2)} — a coin flip would score 0.50`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
                />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1.25 }}>
                {relabel(risk.summary || audit.summary)
                  || 'The audit completed but returned no plain-language summary.'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                An attacker who tries to tell training records from outside records gets it
                right {pct(attackAccuracy)} of the time, using whichever of the two attacks below
                did better. This is a <b>balanced</b> score — members and non-members weighted
                equally — so 50% really is the guessing point even though the audited set itself is
                four-fifths members. On that scale the attack is
                {advantage != null
                  ? ` ${(Math.abs(advantage) * 100).toFixed(1)} points ${advantage >= 0 ? 'better' : 'worse'} than chance.`
                  : ' compared against that baseline.'}
                {' '}The rating is judged against the strongest attack tried, not the average of
                them — a single number that is not exceeded is what a model has to survive.
              </Typography>
            </Box>

            {cohort.source && (
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3' }}>
                <Typography variant="overline" color="text.secondary">
                  How members were determined
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 600 }}>
                  {relabel(cohort.source)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {ownerDeclaredCohort
                    ? 'Read every number below against this line. A model trained outside the sandbox '
                      + 'carries no record of what it saw, so its owner nominated the two datasets — '
                      + 'and the audit is only as sound as that nomination. If the held-out set was in '
                      + 'fact seen during training, the attack has nothing to separate and the risk '
                      + 'reads lower than it truly is.'
                    : 'This sandbox trained the model, so it reproduced that exact split instead of '
                      + 'being told one. The comparison below is against the real training data.'}
                </Typography>
              </Box>
            )}

            <Box sx={{
              p: 2, borderRadius: 2, border: '2px solid', borderColor: meta.color, bgcolor: '#ffffff',
            }}>
              <Typography variant="overline" color="text.secondary">Worst case — the number that matters most</Typography>
              {worst ? (
                <>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: meta.color, mt: 0.5 }}>
                    {pct(worst.tpr)} of real members can be identified with high confidence
                    <Typography component="span" variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      {' '}(at a {pct(worst.fpr, 2)} false-positive rate)
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    A model can look harmless on average and still expose a subset of records
                    completely. This is that check: tuned so the attacker almost never accuses an
                    outsider (target {pct(worst.targeted_fpr, 2)}, achieved {pct(worst.fpr, 2)}),
                    it still correctly picks out {pct(worst.tpr)} of the training records. When
                    membership is itself sensitive, such as a dataset of farms that reported a crop
                    disease, being picked out is itself the disclosure.
                  </Typography>
                  {Number.isFinite(Number(worst.threshold)) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      Decision threshold {num(worst.threshold)} on the attack model&apos;s score.
                    </Typography>
                  )}
                </>
              ) : unavailable ? (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                    Not measurable on this dataset
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {relabel(unavailable.reason)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                    This is a limit of the held-out set&apos;s size, not evidence that nobody can be
                    identified — read the accuracy and AUC above instead.
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  No high-confidence operating point was reported for this audit.
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Why the leakage happens: memorisation
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <StatTile label="Accuracy on training data" value={pct(acc.on_training_data)} />
                <StatTile label="Accuracy on held-out data" value={pct(acc.on_held_out_data)} accent="#455a64" />
                <StatTile
                  label="Generalization gap"
                  value={pct(acc.generalization_gap)}
                  accent={meta.color}
                  caption="training minus held-out"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                The gap is the underlying cause of membership leakage. A model that scores far
                better on the data it trained on than on data it has never seen has memorised
                individual records, and that difference is exactly the signal both attacks below
                exploit. Closing the gap — more data, fewer epochs, regularisation, differential
                privacy — is what lowers the risk.
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Both attacks, side by side</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                The rule-based attack simply assumes &ldquo;the model got this sample right, so it
                was probably a member&rdquo;. The black-box attack trains a small classifier on the
                model&apos;s outputs and is strictly stronger — treat it as the realistic threat.
              </Typography>
              <Box sx={{ mt: 1.25, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Measure</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Rule-based</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Black-box</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ATTACK_ROWS.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          {row.label}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {row.hint}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{row.fmt(ruleBased[row.key])}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{row.fmt(blackBox[row.key])}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>Evaluated on</TableCell>
                      <TableCell align="right">
                        {count(ruleBased.n_members_evaluated)} members
                        <br />
                        {count(ruleBased.n_non_members_evaluated)} non-members
                      </TableCell>
                      <TableCell align="right">
                        {count(blackBox.n_members_evaluated)} members
                        <br />
                        {count(blackBox.n_non_members_evaluated)} non-members
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
              {(cohort.n_members != null || cohort.n_non_members != null) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Audited set: {count(cohort.n_members)} members and {count(cohort.n_non_members)} non-members
                  across {count(cohort.num_classes)} classes
                  {typeof cohort.attack_train_ratio === 'number'
                    ? `; ${pct(cohort.attack_train_ratio, 0)} of them were used to train the attack classifier and the rest to score it.`
                    : '.'}
                  {' '}Every per-sample guess stayed on your machine — only these totals came back.
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                How the black-box attack trades false accusations for hits
              </Typography>
              <Box sx={{ mt: 1 }}>
                <RocCurve
                  roc={blackBox.roc}
                  auc={typeof blackBox.auc === 'number' ? blackBox.auc : audit.auc}
                  worstCase={worst}
                  accent={meta.color}
                />
              </Box>
            </Box>

            {perClass.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Leakage by class</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Leakage is rarely uniform. A small class is memorised more readily than a large
                  one, so the records in it are the most exposed — and an average across the whole
                  dataset hides that. Read the smallest classes first. &ldquo;Samples scored&rdquo;
                  counts every sample of that class the attack was scored on, members and
                  non-members together — it is the size of the slice, not a member count.
                </Typography>
                <Box sx={{ mt: 1.25, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Class</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Samples scored</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Members identified (TPR)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>False-positive rate</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Threshold</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {perClass.map((row, i) => (
                        <TableRow key={`${row.class ?? 'class'}-${i}`}>
                          <TableCell>{row.class != null ? classLabel(String(row.class)) : '—'}</TableCell>
                          <TableCell align="right">{count(row.n)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{pct(row.tpr)}</TableCell>
                          <TableCell align="right">{pct(row.fpr, 2)}</TableCell>
                          <TableCell align="right">{num(row.threshold)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}

            {advice.length > 0 && (
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>What to do next</Typography>
                <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
                  {advice.map((item, i) => (
                    <Typography component="li" variant="body2" key={`advice-${i}`} sx={{ mb: 0.5 }}>
                      {item}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Share this result</Typography>
              {publishError && <Alert severity="error" sx={{ mt: 1 }}>{publishError}</Alert>}
              <FormControlLabel
                sx={{ mt: 0.5 }}
                control={(
                  <Switch
                    size="small"
                    checked={!!audit.published}
                    disabled={publishing}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                )}
                label={(
                  <Typography variant="body2">
                    {audit.published ? 'Published with the model entry' : 'Keep this result to yourself'}
                  </Typography>
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Publishing shows other researchers the risk rating and the plain-language summary
                next to this model. The breakdown on this page — the
                per-class table, the curve, the member counts — is never shared, and neither is
                anything about individual samples. Publishing a good result is how a model earns
                trust; publishing a bad one is entirely your call.
              </Typography>
            </Box>

            <Typography variant="caption" color="text.secondary">
              Engine: {report.engine || 'unspecified'}
              {report.model_format ? ` · model format ${report.model_format}` : ''}
              {' '}· audited {prettyDateTime(report.audited_at || audit.audited_at)}
              {report.notes ? ` · ${report.notes}` : ''}
            </Typography>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={publishing}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacyAuditDialog;
