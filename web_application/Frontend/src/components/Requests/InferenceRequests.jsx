import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, Snackbar,
  Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  Tooltip, Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import axios from 'axios';
import URL from '../../config';

const POLL_INTERVAL_MS = 5000;
const NON_TERMINAL = ['pending', 'collecting', 'classifying'];

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS = {
  pending: { label: 'Pending', color: 'warning', icon: <HourglassTopIcon /> },
  collecting: { label: 'Collecting samples', color: 'info', icon: <AutorenewIcon /> },
  classifying: { label: 'Classifying', color: 'info', icon: <AutorenewIcon /> },
  complete: { label: 'Complete', color: 'success', icon: <CheckCircleOutlineIcon /> },
  failed: { label: 'Failed', color: 'error', icon: <ErrorOutlineIcon /> },
  denied: { label: 'Denied', color: 'default', icon: <HighlightOffIcon /> },
};

const StatusChip = ({ status }) => {
  const meta = STATUS[status] || { label: status || 'unknown', color: 'default', icon: null };
  return <Chip size="small" icon={meta.icon} label={meta.label} color={meta.color} variant="outlined" />;
};

const fmtExact = (iso) => {
  if (!iso) return 'Unknown time';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const safeName = (s) => (s || 'model').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'model';

const pctConf = (c) => {
  if (c === null || c === undefined || c === '') return '—';
  const n = Number(c);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
};

// `n_samples` only exists once the requester's agent has actually exported the
// batch. Before that, `max_samples` is a ceiling the requester asked for — not a
// count — and the owner is approving on the strength of this number, so it must
// never be rendered as if the samples were already counted.
const samplePhrase = (r, whose) => {
  if (r.n_samples != null) {
    return r.max_samples != null && r.n_samples !== r.max_samples
      ? `${r.n_samples} samples (${whose} capped it at ${r.max_samples})`
      : `${r.n_samples} samples`;
  }
  return r.max_samples != null ? `up to ${r.max_samples} samples` : null;
};

const MetaRow = ({ icon, children }) => (
  <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ color: 'text.secondary' }}>
    <Box sx={{ display: 'flex', mt: '2px' }}>{icon}</Box>
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>
);

const NoteBlock = ({ note, label }) => (
  <Box sx={{ mt: 1.75, p: 1.5, borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
      {note || 'No note was given.'}
    </Typography>
  </Box>
);

const EmptyState = ({ title, body }) => (
  <Card variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed' }}>
    <CardContent sx={{ textAlign: 'center', py: 6 }}>
      <ScienceOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
      <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 520, mx: 'auto' }}>
        {body}
      </Typography>
    </CardContent>
  </Card>
);

const CardHeader = ({ title, subtitle, status }) => (
  <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start">
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
    </Box>
    <StatusChip status={status} />
  </Stack>
);

const StageNote = ({ children }) => (
  <Box sx={{ mt: 2 }}>
    <Typography variant="body2" color="text.secondary">{children}</Typography>
    <LinearProgress sx={{ mt: 1.25, borderRadius: 1 }} />
  </Box>
);

const IncomingCard = ({ request, busy, onRespond }) => {
  const { status } = request;
  const samples = samplePhrase(request, 'they');
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <CardHeader
          title={request.model_name || 'Your model'}
          subtitle={(
            <>
              {request.requester_name || 'A user'} wants predictions ·{' '}
              <Tooltip title={fmtExact(request.created_at)}>
                <Box component="span" sx={{ textDecoration: 'underline dotted' }}>
                  {fmtWhen(request.created_at)}
                </Box>
              </Tooltip>
            </>
          )}
          status={status}
        />

        <NoteBlock note={request.note} label="Note from the requester" />

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" />}>
            Requester: {request.requester_name || '—'}
          </MetaRow>
          <MetaRow icon={<StorageOutlinedIcon fontSize="small" />}>
            {samples || 'Sample count not reported yet'}
            {request.phenotype ? ` from their ${request.phenotype} dataset` : ''}
          </MetaRow>
          <MetaRow icon={<LockOutlinedIcon fontSize="small" />}>
            Your model never leaves your machine. Your Site Agent loads your local copy, classifies
            the samples, and returns only the predicted labels and confidences.
          </MetaRow>
        </Stack>

        {status === 'pending' && (
          <>
            <Alert severity="info" sx={{ mt: 2 }}>
              Approving starts a black-box run: no weights, architecture files, or training data are
              sent anywhere. Your Site Agent has to be running for the classification to happen.
            </Alert>
            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} justifyContent="flex-end">
              <Button
                variant="outlined" color="error" disabled={busy}
                startIcon={<HighlightOffIcon />}
                onClick={() => onRespond(request, 'deny')}
              >
                Deny
              </Button>
              <Button
                variant="contained" disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                onClick={() => onRespond(request, 'approve')}
              >
                {busy ? 'Sending…' : 'Approve'}
              </Button>
            </Stack>
          </>
        )}

        {status === 'collecting' && (
          <StageNote>
            Approved. {request.requester_name || 'The requester'}&apos;s Site Agent is exporting the
            samples to classify. Nothing runs on your machine until they arrive.
          </StageNote>
        )}

        {status === 'classifying' && (
          <StageNote>
            Your Site Agent is running the model on your machine now. Only the predictions go back.
          </StageNote>
        )}

        {status === 'complete' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Done. Your agent returned {request.n_samples != null ? `${request.n_samples} ` : ''}predictions to{' '}
            {request.requester_name || 'the requester'}. Your model stayed local.
          </Alert>
        )}

        {status === 'failed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {request.error || 'The classification run failed.'}
          </Alert>
        )}

        {status === 'denied' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            You denied this request. Your model was never run.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const OutgoingCard = ({ request, busy, onView }) => {
  const { status } = request;
  const samples = samplePhrase(request, 'you');
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <CardHeader
          title={request.model_name || 'Model'}
          subtitle={(
            <>
              Owned by {request.owner_name || 'the owner'} ·{' '}
              <Tooltip title={fmtExact(request.created_at)}>
                <Box component="span" sx={{ textDecoration: 'underline dotted' }}>
                  asked {fmtWhen(request.created_at)}
                </Box>
              </Tooltip>
            </>
          )}
          status={status}
        />

        <NoteBlock note={request.note} label="Your note to the owner" />

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" />}>
            Model owner: {request.owner_name || '—'}
          </MetaRow>
          <MetaRow icon={<StorageOutlinedIcon fontSize="small" />}>
            {samples || 'Sample count not reported yet'}
            {request.phenotype ? ` from your ${request.phenotype} dataset` : ''}
          </MetaRow>
        </Stack>

        {status === 'pending' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Waiting for {request.owner_name || 'the owner'} to approve or deny.
          </Typography>
        )}

        {status === 'collecting' && (
          <StageNote>
            Your Site Agent is exporting the samples to be classified. Keep it running.
          </StageNote>
        )}

        {status === 'classifying' && (
          <StageNote>
            {request.owner_name || 'The owner'}&apos;s Site Agent is running the model on their own
            machine. You get back predicted labels and confidences — never the model itself.
          </StageNote>
        )}

        {status === 'complete' && (
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} justifyContent="flex-end">
            <Button
              variant="contained" disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <VisibilityOutlinedIcon />}
              onClick={() => onView(request)}
            >
              {busy ? 'Loading…' : 'View predictions'}
            </Button>
          </Stack>
        )}

        {status === 'failed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {request.error || 'The classification run failed on the owner’s machine.'}
          </Alert>
        )}

        {status === 'denied' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {request.owner_name || 'The owner'} declined this request.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const InferenceRequests = () => {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [results, setResults] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const resp = await axios.get(`${URL}/api/inference-requests`, { headers: authHeader() });
      setIncoming(Array.isArray(resp?.data?.incoming) ? resp.data.incoming : []);
      setOutgoing(Array.isArray(resp?.data?.outgoing) ? resp.data.outgoing : []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load inference requests');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const anyActive = useMemo(
    () => [...incoming, ...outgoing].some((r) => NON_TERMINAL.includes(r.status)),
    [incoming, outgoing],
  );

  // Only poll while something can still change on its own; a settled board is static.
  useEffect(() => {
    if (!anyActive) return undefined;
    const id = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [anyActive, load]);

  const pendingIncoming = incoming.filter((r) => r.status === 'pending').length;

  const respond = async (request, decision) => {
    setBusyId(request.request_id);
    try {
      await axios.post(
        `${URL}/api/inference-requests/${request.request_id}/respond`,
        { decision },
        { headers: authHeader() },
      );
      setSnackbar({
        open: true,
        severity: decision === 'approve' ? 'success' : 'info',
        message: decision === 'approve'
          ? 'Approved. Your Site Agent will classify the samples locally once they arrive — keep it running.'
          : 'Request denied. Your model was not run.',
      });
      await load(true);
    } catch (err) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: err?.response?.data?.error || err.message || 'Could not send your response',
      });
    } finally {
      setBusyId(null);
    }
  };

  const viewResults = async (request) => {
    setBusyId(request.request_id);
    try {
      const resp = await axios.get(
        `${URL}/api/inference-requests/${request.request_id}/results`,
        { headers: authHeader() },
      );
      const predictions = resp?.data?.predictions || {};
      setResults({
        request,
        csv: resp?.data?.csv || '',
        // An agent may report a bare label per sample instead of an object; the
        // server's own CSV builder allows for that, so the table has to as well
        // or every prediction renders as an em dash.
        rows: Object.entries(predictions).map(([sampleId, p]) => {
          const cell = p && typeof p === 'object' ? p : { predicted_class: p };
          return {
            sampleId,
            predictedClass: cell.predicted_class,
            confidence: cell.confidence,
          };
        }),
      });
    } catch (err) {
      setSnackbar({
        open: true,
        severity: 'error',
        message: err?.response?.data?.error || err.message || 'Could not load predictions',
      });
    } finally {
      setBusyId(null);
    }
  };

  const downloadResults = () => {
    if (!results) return;
    // The server ships a formatted CSV; fall back to the prediction map if it is absent.
    const csv = results.csv
      || ['sample_id,predicted_class,confidence']
        .concat(results.rows.map((r) => `${r.sampleId},${r.predictedClass ?? ''},${r.confidence ?? ''}`))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeName(results.request.model_name)}_predictions.csv`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(link);
  };

  const showEmptyShell = loading && incoming.length === 0 && outgoing.length === 0;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" gutterBottom>Inference Requests</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 780 }}>
            Black-box classification between sites. A model is always run by its owner&apos;s Site
            Agent on the owner&apos;s machine — the model is never transferred to anyone. Only the
            samples to classify go in, and only predicted labels and confidences come out.
          </Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => load(false)} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab
          label={(
            <Badge
              color="error"
              badgeContent={pendingIncoming}
              sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}
            >
              <Box sx={{ pr: pendingIncoming > 0 ? 1.5 : 0 }}>Incoming ({incoming.length})</Box>
            </Badge>
          )}
        />
        <Tab label={`Your requests (${outgoing.length})`} />
      </Tabs>

      {showEmptyShell ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : tab === 0 ? (
        incoming.length === 0 ? (
          <EmptyState
            title="No one has asked your models to classify anything yet."
            body="Make a model public in the Model Repository and allow inference requests. Other sites
              can then ask your agent to classify their samples, without ever seeing the model."
          />
        ) : (
          <Stack spacing={2}>
            {incoming.map((r) => (
              <IncomingCard
                key={r.request_id}
                request={r}
                busy={busyId === r.request_id}
                onRespond={respond}
              />
            ))}
          </Stack>
        )
      ) : outgoing.length === 0 ? (
        <EmptyState
          title="You haven't requested any predictions yet."
          body="Browse the Model Repository for a public model that accepts inference requests, and ask
            its owner to classify samples from one of your datasets."
        />
      ) : (
        <Stack spacing={2}>
          {outgoing.map((r) => (
            <OutgoingCard
              key={r.request_id}
              request={r}
              busy={busyId === r.request_id}
              onView={viewResults}
            />
          ))}
        </Stack>
      )}

      <Dialog open={!!results} onClose={() => setResults(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Predictions — {results?.request?.model_name || 'Model'}
          <Typography variant="body2" color="text.secondary">
            {results?.rows?.length || 0} samples classified by {results?.request?.owner_name || 'the owner'}
            &apos;s Site Agent on their machine.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {results && results.rows.length === 0 ? (
            <Alert severity="info">The run completed but returned no predictions.</Alert>
          ) : (
            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Sample</strong></TableCell>
                    <TableCell><strong>Predicted class</strong></TableCell>
                    <TableCell align="right"><strong>Confidence</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(results?.rows || []).map((row) => (
                    <TableRow key={row.sampleId} hover>
                      <TableCell><code>{row.sampleId}</code></TableCell>
                      <TableCell>{row.predictedClass ?? '—'}</TableCell>
                      <TableCell align="right">{pctConf(row.confidence)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResults(null)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<DownloadRoundedIcon />}
            onClick={downloadResults}
            disabled={!results || results.rows.length === 0}
          >
            Download CSV
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default InferenceRequests;
