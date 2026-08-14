import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Container, Divider, FormControlLabel,
  IconButton, Paper, Slider, Snackbar, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import MarkEmailUnreadOutlinedIcon from '@mui/icons-material/MarkEmailUnreadOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const EPS_MIN = 0.1;
const EPS_MAX = 20;
const EPS_DEFAULT = 3;

// Qualitative reading of the privacy budget, so the owner picks a number with
// some idea of what it costs them.
const epsilonMeaning = (eps) => {
  if (eps <= 1) return { label: 'Very strong privacy', color: 'success', hint: 'heavy noise — useful for coarse trends only' };
  if (eps <= 3) return { label: 'Strong privacy', color: 'success', hint: 'noticeable noise, broad signals survive' };
  if (eps <= 8) return { label: 'Moderate privacy', color: 'warning', hint: 'a balanced amount of noise' };
  return { label: 'Weak privacy', color: 'error', hint: 'little noise — close to your real data' };
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const DatasetRow = ({ dataset, onSaved, onNotify }) => {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(dataset.description || '');
  const [shareable, setShareable] = useState(!!dataset.shareable);
  const [epsText, setEpsText] = useState(String(dataset.share_epsilon ?? EPS_DEFAULT));
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  // Re-sync whenever the server's copy of this dataset changes (after a save or a
  // refresh). One effect per field on purpose: a combined effect would also reset the
  // description/epsilon drafts when only `shareable` round-trips (e.g. the user types a
  // description and then flips the switch), silently discarding what they typed.
  useEffect(() => {
    setDescription(dataset.description || '');
  }, [dataset.description]);

  useEffect(() => {
    setShareable(!!dataset.shareable);
  }, [dataset.shareable]);

  useEffect(() => {
    setEpsText(String(dataset.share_epsilon ?? EPS_DEFAULT));
  }, [dataset.share_epsilon]);

  const patch = async (body) => {
    setSaving(true);
    setRowError('');
    try {
      const res = await axios.patch(`${URL}/api/my-datasets/${dataset.id}`, body, { headers: authHeader() });
      onSaved(dataset.id, res.data);
      return true;
    } catch (err) {
      setRowError(err?.response?.data?.error || err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleShareable = async (next) => {
    setShareable(next);
    const ok = await patch({ shareable: next });
    if (!ok) {
      setShareable(!next);
      return;
    }
    if (next) setOpen(true);
    onNotify(next
      ? `"${dataset.phenotype || 'Dataset'}" is now advertised as available to share.`
      : `"${dataset.phenotype || 'Dataset'}" is no longer advertised.`);
  };

  const epsNum = Number(epsText);
  const epsValid = Number.isFinite(epsNum) && epsNum >= EPS_MIN && epsNum <= EPS_MAX;
  const savedEps = Number(dataset.share_epsilon ?? EPS_DEFAULT);
  const dirty = description !== (dataset.description || '') || (epsValid && epsNum !== savedEps);
  // `meaning` tracks the draft (what the slider currently reads); `savedMeaning` tracks
  // what the server actually has, which is what the always-visible row chip reports.
  const meaning = epsilonMeaning(epsValid ? epsNum : savedEps);
  const savedMeaning = epsilonMeaning(savedEps);
  const pending = Number(dataset.pending_requests) || 0;

  const saveDetails = async () => {
    const ok = await patch({ description, share_epsilon: Number(epsNum.toFixed(2)) });
    if (ok) onNotify('Dataset updated.');
  };

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell sx={{ width: 48 }}>
          <IconButton size="small" onClick={() => setOpen((o) => !o)} aria-label="Edit sharing settings">
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{dataset.phenotype || '—'}</Typography>
          {dataset.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 280 }} noWrap>
              {dataset.description}
            </Typography>
          )}
        </TableCell>
        <TableCell align="right">{dataset.number_of_samples != null ? dataset.number_of_samples : '—'}</TableCell>
        <TableCell align="right">
          {dataset.n_snps != null ? dataset.n_snps : <Chip size="small" label="not synced yet" />}
        </TableCell>
        <TableCell>{fmtDate(dataset.metadata_updated_at)}</TableCell>
        <TableCell>
          {dataset.file_sha256 ? (
            <Tooltip title={dataset.file_sha256}>
              <code>{String(dataset.file_sha256).slice(0, 12)}…</code>
            </Tooltip>
          ) : '—'}
        </TableCell>
        <TableCell>
          <Stack spacing={0.75} alignItems="flex-start">
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Switch
                  size="small"
                  checked={shareable}
                  disabled={saving}
                  onChange={(e) => toggleShareable(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" color={shareable ? 'text.primary' : 'text.secondary'}>
                  {shareable ? 'Available to share' : 'Not shared'}
                </Typography>
              }
            />
            {shareable && (
              <Chip
                size="small"
                variant="outlined"
                color={savedMeaning.color}
                icon={<ShieldOutlinedIcon />}
                label={`ε = ${savedEps}`}
              />
            )}
            {pending > 0 && (
              <Chip
                size="small"
                color="warning"
                clickable
                component={RouterLink}
                to="/data-requests"
                icon={<MarkEmailUnreadOutlinedIcon />}
                label={`${pending} request${pending === 1 ? '' : 's'} waiting`}
              />
            )}
          </Stack>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell sx={{ py: 0, borderBottom: open ? undefined : 'none' }} colSpan={7}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2.5 }}>
              {rowError && <Alert severity="error" sx={{ mb: 2 }}>{rowError}</Alert>}

              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Description</Typography>
              <Typography variant="caption" color="text.secondary">
                What this cohort is — shown to anyone who finds this dataset in Find Collaborators.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={2}
                size="small"
                sx={{ mt: 1 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 412 adult cases and controls genotyped on the GSA v3 array, recruited 2021–2023."
              />

              <Divider sx={{ my: 2.5 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Privacy budget for sharing (ε)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {shareable
                  ? 'The budget every approved copy of this dataset is released with. Lower ε adds more noise and gives stronger privacy; higher ε keeps the copy closer to your real data.'
                  : 'Only applied once this dataset is marked available to share. Lower ε adds more noise and gives stronger privacy; higher ε keeps the copy closer to your real data.'}
              </Typography>

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={3}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ mt: 2, opacity: shareable ? 1 : 0.6 }}
              >
                <Box sx={{ flex: 1, px: 1 }}>
                  <Slider
                    value={epsValid ? epsNum : savedEps}
                    min={EPS_MIN}
                    max={EPS_MAX}
                    step={0.1}
                    valueLabelDisplay="auto"
                    marks={[
                      { value: EPS_MIN, label: '0.1' },
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                      { value: EPS_MAX, label: '20' },
                    ]}
                    onChange={(e, v) => setEpsText(String(v))}
                  />
                </Box>
                <TextField
                  label="ε"
                  size="small"
                  type="number"
                  sx={{ width: 150 }}
                  value={epsText}
                  onChange={(e) => setEpsText(e.target.value)}
                  inputProps={{ min: EPS_MIN, max: EPS_MAX, step: 0.1 }}
                  error={!epsValid}
                  helperText={epsValid ? `${EPS_MIN} – ${EPS_MAX}` : `Must be between ${EPS_MIN} and ${EPS_MAX}`}
                />
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" color={meaning.color} variant="outlined" label={meaning.label} />
                <Typography variant="caption" color="text.secondary">{meaning.hint}</Typography>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                <strong>Transform applied:</strong> {dataset.share_mechanism || '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Approving a request never sends your raw data. Your own Site Agent builds a
                differentially-private copy of this dataset on your machine at the ε above, and only
                that copy is handed to the requester.
              </Typography>

              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
                <Button
                  variant="contained"
                  size="small"
                  sx={{ borderRadius: 2 }}
                  onClick={saveDetails}
                  disabled={saving || !dirty || !epsValid}
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
                {dirty && !saving && (
                  <Typography variant="caption" color="text.secondary">Unsaved changes</Typography>
                )}
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const MyData = () => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${URL}/api/my-datasets`, { headers: authHeader() });
      setDatasets(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not load your datasets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // PATCH returns only the share settings, so merge rather than replace the row.
  const handleSaved = (id, updated) => {
    setDatasets((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
  };

  const totalPending = datasets.reduce((n, d) => n + (Number(d.pending_requests) || 0), 0);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" gutterBottom>My Data</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 820 }}>
            Datasets you have registered. Sample counts and markers are reported by your local Site
            Agent — your raw genotype files never leave your machine. Mark a dataset as available to
            share and set its privacy budget, and other researchers can find it and ask you for a copy.
          </Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchData} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        Approving a request never sends raw data. Your own Site Agent produces a
        differentially-private copy of the dataset locally, and only that copy is handed to the
        requester — the raw file stays on your machine.
      </Alert>

      {totalPending > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button size="small" component={RouterLink} to="/data-requests">Review</Button>
          }
        >
          {totalPending} data {totalPending === 1 ? 'request is' : 'requests are'} waiting for your decision.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : error ? (
        <Alert
          severity="error"
          action={<Button size="small" onClick={fetchData}>Retry</Button>}
        >
          {error}
        </Alert>
      ) : datasets.length === 0 ? (
        <Alert severity="info">
          No datasets yet. Register a dataset, then start your Site Agent so it can report the
          sample count and markers here.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell><strong>Phenotype</strong></TableCell>
                <TableCell align="right"><strong>Samples</strong></TableCell>
                <TableCell align="right"><strong>Markers</strong></TableCell>
                <TableCell><strong>Last synced</strong></TableCell>
                <TableCell><strong>File fingerprint</strong></TableCell>
                <TableCell><strong>Sharing</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((d) => (
                <DatasetRow
                  key={d.id}
                  dataset={d}
                  onSaved={handleSaved}
                  onNotify={(message) => setSnackbar({ open: true, message })}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Container>
  );
};

export default MyData;
