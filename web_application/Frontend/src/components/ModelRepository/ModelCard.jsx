import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, Switch, TextField,
  Tooltip, Typography,
} from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PublicIcon from '@mui/icons-material/Public';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EventIcon from '@mui/icons-material/Event';
import GroupsIcon from '@mui/icons-material/Groups';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import axios from 'axios';
import URL from '../../config';
import PrivacyAuditDialog, { riskMeta } from './PrivacyAuditDialog';
import { relabel, classLabel } from '../Utils/demoTerms';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const POLL_MS = 5000;

const pct = (v) => (typeof v === 'number' && !Number.isNaN(v) ? `${(v * 100).toFixed(1)}%` : '—');
const num = (v, d = 4) => (typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(d) : '—');

const prettyDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const MetricTile = ({ label, value, accent }) => (
  <Box sx={{
    flex: 1, minWidth: 84, textAlign: 'center', py: 1.25, px: 1,
    borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3',
  }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: accent || 'primary.main', lineHeight: 1.1 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

const MetaRow = ({ icon, children }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    {icon}
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>
);

// Asking the owner which two of their datasets define the cohort. Only they can answer
// this for a model the sandbox did not train, so the dialog exists to get an answer
// rather than a guess.
const AuditCohortDialog = ({ open, model, busy, error, initial, onClose, onStart }) => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [members, setMembers] = useState('');
  const [nonMembers, setNonMembers] = useState('');
  const [labelCol, setLabelCol] = useState('');

  useEffect(() => {
    if (!open) return;
    setMembers(initial?.members_phenotype || '');
    setNonMembers(initial?.non_members_phenotype || '');
    setLabelCol(initial?.label_col || '');
  }, [open, initial]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    axios.get(`${URL}/api/my-datasets`, { headers: authHeader() })
      .then((resp) => {
        if (cancelled) return;
        setDatasets(Array.isArray(resp.data) ? resp.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.response?.data?.error || err.message || 'Could not load your datasets.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, reloadKey]);

  // The agent resolves a dataset by its folder name, so the phenotype is the value —
  // and two rows sharing one would be indistinguishable choices here.
  const options = useMemo(() => {
    const seen = new Set();
    return datasets.reduce((acc, d) => {
      const phenotype = String(d.phenotype || '').trim();
      if (!phenotype || seen.has(phenotype)) return acc;
      seen.add(phenotype);
      acc.push({ phenotype, samples: d.number_of_samples });
      return acc;
    }, []);
  }, [datasets]);

  const sameCohort = Boolean(members) && members === nonMembers;
  const canStart = Boolean(members) && Boolean(nonMembers) && !sameCohort && !busy;

  const close = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Which data did this model see?
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          {model?.name || 'Untitled model'} · privacy audit setup
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Membership leakage is measured by comparing the data the model trained on against data it
          never saw — the whole test is whether the model treats the two differently. For a model
          trained in this sandbox we hold that split on record. This one you brought with you, so
          only you know which dataset was which, and guessing would produce numbers that look
          authoritative and mean nothing. Name the two below and the audit is exactly as real as
          any other.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{relabel(error)}</Alert>}

        {!model?.local_file && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No file name is recorded for this model. Your agent will look for a file named after the
            model id in its model folder; if it is called something else, add the name with Edit
            first — the name alone, since the file itself is never uploaded.
          </Alert>
        )}

        {loading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Loading your datasets…</Typography>
          </Stack>
        ) : loadError ? (
          <Alert severity="error"
            action={<Button size="small" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>}>
            {relabel(loadError)}
          </Alert>
        ) : options.length < 2 ? (
          <Alert severity="warning">
            An audit needs two separate datasets on your machine: the one this model trained on and
            one it never saw. You currently have {options.length === 1 ? 'only one' : 'none'}{' '}
            registered. Add the held-out set under My Data — your Site Agent reads both locally, and
            neither is uploaded.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <TextField
              select fullWidth label="Trained on (members)"
              value={members} onChange={(e) => setMembers(e.target.value)}
              helperText="The dataset whose records went into training this model."
            >
              {options.map((o) => (
                <MenuItem key={`m-${o.phenotype}`} value={o.phenotype}>
                  {o.phenotype}{o.samples != null ? ` · ${o.samples} samples` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select fullWidth label="Held out (non-members)"
              value={nonMembers} onChange={(e) => setNonMembers(e.target.value)}
              error={sameCohort}
              helperText={sameCohort
                ? 'Pick a different dataset — comparing a dataset with itself measures nothing.'
                : 'A dataset this model never saw during training.'}
            >
              {options.map((o) => (
                <MenuItem key={`n-${o.phenotype}`} value={o.phenotype}>
                  {o.phenotype}{o.samples != null ? ` · ${o.samples} samples` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth label="Label column (optional)"
              value={labelCol} onChange={(e) => setLabelCol(e.target.value)}
              placeholder="label"
              helperText="Only needed if the outcome column in those files is not the one your agent picks by default."
            />

            <Typography variant="caption" color="text.secondary">
              Both datasets are read on your own machine, by your own Site Agent, alongside the model
              file already sitting in its model folder. Nothing about an individual record comes back
              here — only the aggregate numbers in the report.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button
          variant="contained" disabled={!canStart}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ShieldOutlinedIcon />}
          onClick={() => onStart({
            members_phenotype: members,
            non_members_phenotype: nonMembers,
            ...(labelCol.trim() ? { label_col: labelCol.trim() } : {}),
          })}
        >
          {busy ? 'Queueing…' : 'Run privacy audit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ModelCard = ({ model, onPatch, onEdit, onDelete, onRequestClassification, onAuditChange }) => {
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(model.privacy_audit || null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortError, setCohortError] = useState('');
  // The report only carries a prose description of the cohort, so remember what was
  // submitted to prefill a re-run rather than making the owner re-derive it.
  const [lastCohort, setLastCohort] = useState(null);

  const metrics = model.metrics || {};
  const loss = metrics.loss != null ? metrics.loss : metrics.train_loss;
  const hasMetrics = [metrics.accuracy, metrics.f1_macro, loss].some((v) => typeof v === 'number');
  const isFederated = (model.source || 'federated') === 'federated';
  const isPublic = model.visibility === 'public';
  const classNames = Array.isArray(model.class_names) ? model.class_names : [];
  const shownClasses = classNames.slice(0, 8);

  const modelId = model.model_id;
  // `none` means "no audit yet"; it still carries `available`, so keep the object.
  const auditStatus = audit?.status && audit.status !== 'none' ? audit.status : null;
  const auditRunning = auditStatus === 'queued' || auditStatus === 'running';
  // A re-run leaves the previous report in place server-side precisely so a published
  // rating does not vanish while the fresh one is computed — `_audit_view` keeps serving
  // `risk_level` through `queued`/`running`. Gating the chip on `complete` alone threw
  // that away and made every model look unaudited for the length of its own re-run.
  const risk = (auditStatus === 'complete' || (auditRunning && audit?.risk_level))
    ? riskMeta(audit.risk_level)
    : null;
  const showRiskChip = Boolean(risk) && (model.is_owner || audit.published);

  // The parent's callback is often an inline arrow, which would restart the poll timer on
  // every render and stop it ever firing. Read it through a ref instead of depending on it.
  const auditChangeRef = useRef(onAuditChange);
  useEffect(() => { auditChangeRef.current = onAuditChange; });

  useEffect(() => { setAudit(model.privacy_audit || null); }, [model.privacy_audit]);

  const fetchAudit = useCallback(async () => {
    const resp = await axios.get(`${URL}/api/models/${modelId}/privacy-audit`, { headers: authHeader() });
    return resp.data || null;
  }, [modelId]);

  useEffect(() => {
    if (!model.is_owner || !auditRunning) return undefined;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const data = await fetchAudit();
        if (stopped) return;
        setAudit(data);
        if (data && (data.status === 'complete' || data.status === 'failed')) {
          clearInterval(timer);
          if (auditChangeRef.current) auditChangeRef.current();
        }
      } catch {
        // A blip while the job runs is not worth tearing the card down; the next tick retries.
      }
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [model.is_owner, auditRunning, fetchAudit]);

  const patch = async (body) => {
    setBusy(true);
    try {
      await onPatch(model, body);
    } finally {
      setBusy(false);
    }
  };

  const runAudit = async (body = {}) => {
    setAuditBusy(true);
    setAuditError('');
    setCohortError('');
    try {
      const resp = await axios.post(`${URL}/api/models/${modelId}/privacy-audit`, body, { headers: authHeader() });
      // A re-run keeps the previous publish choice AND the previous report server-side, so
      // carry the whole prior view forward rather than replacing it — dropping `risk_level`
      // here would blank the rating the server is still happily serving to everyone else.
      setAudit((prev) => ({
        ...(prev || {}),
        status: resp?.data?.status || 'queued',
        published: Boolean(prev?.published),
        requested_at: new Date().toISOString(),
        error: null,
      }));
      if (body.members_phenotype) setLastCohort(body);
      setCohortOpen(false);
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data || {};
      const message = [data.error || data.message || err.message, data.hint]
        .filter(Boolean).join(' ');
      // A 409 can mean an audit is already in flight — pick it up so the card shows progress
      // instead of a dead-end error.
      if (status === 409) {
        setCohortOpen(false);
        setAuditError(message || 'An audit is already running for this model.');
        try {
          const fresh = await fetchAudit();
          if (fresh && fresh.status !== 'none') setAudit(fresh);
        } catch {
          // Keep the server's 409 message; it is the more useful of the two.
        }
      } else if (!isFederated && (cohortOpen || (Array.isArray(data.needs) && data.needs.length))) {
        // The server is telling us the cohort is missing or unusable, so put the message
        // in the dialog where it can actually be corrected. Only an external model has
        // that dialog mounted — routing a federated error there would hide it.
        setCohortError(message || 'Could not queue the privacy audit.');
        setCohortOpen(true);
      } else {
        setAuditError(message || 'Could not queue the privacy audit.');
      }
    } finally {
      setAuditBusy(false);
    }
  };

  // A federated model's split is on record here, so one click is enough. An external one
  // needs the owner to name the two cohorts first.
  const startAudit = () => {
    if (isFederated) return runAudit();
    setCohortError('');
    setCohortOpen(true);
    return undefined;
  };

  const startLabel = (() => {
    if (auditBusy) return 'Queueing…';
    return isFederated ? 'Run privacy audit' : 'Set up privacy audit';
  })();

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2,
        overflow: 'hidden', transition: 'box-shadow .2s, transform .2s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{
        height: 5,
        background: isFederated
          ? 'linear-gradient(90deg,#0f3a63,#42a5f5)'
          : 'linear-gradient(90deg,#4a148c,#9575cd)',
      }} />

      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {model.name || model.collaboration_name || 'Untitled model'}
        </Typography>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
          <Tooltip title={isFederated
            ? 'Trained inside this sandbox by a federated-learning collaboration'
            : 'Brought by its owner and listed here as metadata'}>
            <Chip
              size="small"
              icon={isFederated ? <HubIcon /> : <Inventory2OutlinedIcon />}
              label={isFederated ? 'Federated' : 'Registered'}
              color={isFederated ? 'primary' : 'secondary'}
              variant="outlined"
            />
          </Tooltip>
          <Tooltip title={isPublic
            ? 'Every logged-in researcher can see this entry'
            : 'Only you can see this entry'}>
            <Chip
              size="small"
              icon={isPublic ? <PublicIcon /> : <LockOutlinedIcon />}
              label={isPublic ? 'Public' : 'Private'}
              color={isPublic ? 'primary' : 'default'}
              variant={isPublic ? 'filled' : 'outlined'}
            />
          </Tooltip>
          {model.allow_inference_requests && (
            <Tooltip title="The owner's agent will classify samples you send, on their own machine">
              <Chip size="small" icon={<ScienceOutlinedIcon />} label="Black-box service" color="success" variant="outlined" />
            </Tooltip>
          )}
          {showRiskChip && (
            <Tooltip title={relabel(audit.summary)
              || 'Membership inference audit: how well an attacker could tell which records were in the training data.'}>
              <Chip
                size="small"
                icon={<ShieldOutlinedIcon />}
                label={`Privacy risk: ${risk.label.toLowerCase()}`}
                color={risk.chip}
                variant="outlined"
              />
            </Tooltip>
          )}
          {model.framework && <Chip size="small" label={model.framework} variant="outlined" />}
        </Stack>

        {model.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {model.description}
          </Typography>
        )}

        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 500 }}>
          {relabel(model.task) || 'Classification'}
          {model.architecture ? ` · ${relabel(model.architecture)}` : ''}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <StorageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Trained on <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {model.dataset || 'an unnamed dataset'}
            </Box>
          </Typography>
        </Stack>

        <Box sx={{ mt: 2 }}>
          {hasMetrics ? (
            <>
              <Stack direction="row" spacing={1}>
                <MetricTile label="Accuracy" value={pct(metrics.accuracy)} />
                <MetricTile label="F1 (macro)" value={pct(metrics.f1_macro)} accent="#6a1b9a" />
                <MetricTile label="Loss" value={num(loss)} accent="#455a64" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                Measured on {model.dataset || 'a dataset the owner has not named'} — not a universal score.
              </Typography>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No performance metrics reported for this model.
            </Typography>
          )}
        </Box>

        {shownClasses.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Classes</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {shownClasses.map((c) => (
                <Chip key={c} size="small" label={classLabel(c)} sx={{ bgcolor: '#eef3f8' }} />
              ))}
              {classNames.length > shownClasses.length && (
                <Chip size="small" variant="outlined" label={`+${classNames.length - shownClasses.length}`} />
              )}
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            {model.is_owner ? 'You' : model.owner_name || 'Unknown owner'}
            {model.collaboration_name ? ` · ${model.collaboration_name}` : ''}
          </MetaRow>
          <MetaRow icon={<EventIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            Listed {prettyDate(model.published_at)}
          </MetaRow>
          {(model.num_participants != null || model.num_rounds != null) && (
            <MetaRow icon={<GroupsIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
              {model.num_participants ?? '—'} sites · {model.num_rounds ?? '—'} rounds
              {model.num_classes != null ? ` · ${model.num_classes} classes` : ''}
            </MetaRow>
          )}
          <MetaRow icon={<LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            Catalog entry only — the weights stay on the owner&apos;s machine.
          </MetaRow>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {model.is_owner ? (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#fafbfd' }}>
            <Typography variant="overline" color="text.secondary">Owner controls</Typography>
            <Stack sx={{ mt: 0.5 }}>
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={isPublic}
                    disabled={busy}
                    onChange={(e) => patch({ visibility: e.target.checked ? 'public' : 'private' })}
                  />
                )}
                label={<Typography variant="body2">Listed publicly</Typography>}
              />
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={!!model.allow_inference_requests}
                    disabled={busy || !isPublic}
                    onChange={(e) => patch({ allow_inference_requests: e.target.checked })}
                  />
                )}
                label={(
                  <Typography variant="body2" color={isPublic ? 'text.primary' : 'text.disabled'}>
                    Accept classification requests
                  </Typography>
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                {isPublic
                  ? 'Others can ask you to classify their samples; your agent runs the model locally and returns predictions only.'
                  : 'Make it public first — a private entry cannot advertise a service.'}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
                disabled={busy} onClick={() => onEdit(model)}>
                Edit
              </Button>
              {!isFederated && (
                <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineIcon />}
                  disabled={busy} onClick={() => onDelete(model)}>
                  Delete
                </Button>
              )}
            </Stack>
            {isFederated && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                A federated entry is the record of a collaboration that happened, so it cannot be
                deleted. Switch it to private to unlist it.
              </Typography>
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography variant="overline" color="text.secondary">Privacy risk</Typography>

            {auditError && (
              <Alert severity="warning" sx={{ mt: 0.5, mb: 1 }} onClose={() => setAuditError('')}>
                {relabel(auditError)}
              </Alert>
            )}

            {auditRunning ? (
              <>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    {auditStatus === 'queued'
                      ? 'Queued — waiting for your Site Agent to pick it up. Keep it running.'
                      : 'Running the attacks on your Site Agent…'}
                  </Typography>
                </Stack>
                {/* A job queued while the agent was offline never gets claimed, so the status
                    never moves off `queued` and every other control here is hidden behind it.
                    The server already allows a replacement once the old one has timed out, and
                    refuses with a 409 while it has not — so offering the action is safe, and
                    withholding it is what would strand the model. */}
                <Button size="small" sx={{ mt: 0.75 }} disabled={auditBusy} onClick={startAudit}>
                  {auditBusy ? 'Queueing…' : 'Queue it again'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Only needed if your Site Agent was offline when this was queued. A job that is
                  genuinely still in flight is kept, and says so.
                </Typography>
              </>
            ) : auditStatus === 'complete' ? (
              <>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                  <Button size="small" variant="outlined" startIcon={<ShieldOutlinedIcon />}
                    onClick={() => setAuditOpen(true)}>
                    View privacy audit
                  </Button>
                  <Button size="small" disabled={auditBusy} onClick={startAudit}>
                    {auditBusy ? 'Queueing…' : 'Re-run'}
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  {risk ? `${risk.label} risk` : 'Audited'} · audited {prettyDate(audit.audited_at || audit.completed_at)} ·{' '}
                  {audit.published
                    ? 'the rating and headline numbers are shown to others'
                    : 'visible only to you'}
                </Typography>
              </>
            ) : auditStatus === 'failed' ? (
              <>
                <Alert severity="error" sx={{ mt: 0.5 }}>
                  {audit.error || 'Your Site Agent could not complete the analysis.'}
                </Alert>
                <Button size="small" sx={{ mt: 1 }} disabled={auditBusy} onClick={startAudit}
                  startIcon={auditBusy ? <CircularProgress size={14} /> : <ShieldOutlinedIcon />}>
                  {auditBusy ? 'Queueing…' : 'Try again'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="small" variant="outlined" sx={{ mt: 0.5 }}
                  startIcon={auditBusy ? <CircularProgress size={14} /> : <ShieldOutlinedIcon />}
                  disabled={auditBusy}
                  onClick={startAudit}
                >
                  {startLabel}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Tests whether someone holding this model could tell that a particular record was in
                  its training data. It runs on your own Site Agent — the only place the model and
                  its training data both exist — so keep the agent running. Only aggregate numbers
                  come back here.
                  {!isFederated && ' Because this model was trained outside the sandbox, you name the '
                    + 'two datasets first: the one it learned from and one it never saw. That '
                    + 'comparison is the measurement.'}
                </Typography>
              </>
            )}
          </Box>
        ) : model.allow_inference_requests ? (
          <Button
            fullWidth variant="contained" sx={{ mt: 2, borderRadius: 2 }}
            startIcon={<SendOutlinedIcon />}
            onClick={() => onRequestClassification(model)}
          >
            Request classification
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            The owner is not offering a classification service for this model.
          </Typography>
        )}
      </CardContent>

      {model.is_owner && !isFederated && (
        <AuditCohortDialog
          open={cohortOpen}
          model={model}
          busy={auditBusy}
          error={cohortError}
          initial={lastCohort}
          onClose={() => setCohortOpen(false)}
          onStart={runAudit}
        />
      )}

      {model.is_owner && (
        <PrivacyAuditDialog
          open={auditOpen}
          model={model}
          onClose={() => setAuditOpen(false)}
          onAuditChange={() => {
            // Publishing changes what others see, so refresh the card's copy and the list.
            fetchAudit().then((data) => setAudit(data)).catch(() => {});
            if (auditChangeRef.current) auditChangeRef.current();
          }}
        />
      )}
    </Card>
  );
};

export default ModelCard;
