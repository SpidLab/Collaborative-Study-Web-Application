import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertTitle, Badge, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Divider, LinearProgress, Snackbar, Stack, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import DownloadDoneIcon from '@mui/icons-material/DownloadDone';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EventIcon from '@mui/icons-material/Event';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import axios from 'axios';
import URL from '../../config';
import { relabel } from '../Utils/demoTerms';

const POLL_INTERVAL_MS = 5000;
// `downloaded` is settled — the handover happened and the copy is gone, nothing
// left to wait for. `downloading` is the brief window while it is being served.
const NON_TERMINAL = ['pending', 'transforming', 'downloading'];

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS = {
  pending: { label: 'Pending', color: 'warning', icon: <HourglassTopIcon /> },
  transforming: { label: 'Transforming', color: 'info', icon: <AutorenewIcon /> },
  ready: { label: 'Ready', color: 'success', icon: <CheckCircleOutlineIcon /> },
  downloading: { label: 'Downloading', color: 'info', icon: <AutorenewIcon /> },
  downloaded: { label: 'Downloaded', color: 'success', icon: <DownloadDoneIcon /> },
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

const safeName = (s) => (s || 'dataset').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'dataset';

// The counts are written onto the request before the matrix is erased, so they
// stay readable on a `downloaded` request even though the data itself is gone.
const sizePhrase = (r) => {
  if (r.n_samples == null && r.n_snps == null) return null;
  const samples = r.n_samples != null ? `${r.n_samples} samples` : 'an unrecorded number of samples';
  return r.n_snps != null ? `${samples} × ${r.n_snps} attributes` : samples;
};

const MetaRow = ({ icon, children }) => (
  <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ color: 'text.secondary' }}>
    <Box sx={{ display: 'flex', mt: '2px' }}>{icon}</Box>
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>
);

const PurposeBlock = ({ purpose }) => (
  <Box sx={{ mt: 1.75, p: 1.5, borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3' }}>
    <Typography variant="caption" color="text.secondary">Stated purpose</Typography>
    <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
      {purpose || 'No purpose was given.'}
    </Typography>
  </Box>
);

const EmptyState = ({ title, body }) => (
  <Card variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed' }}>
    <CardContent sx={{ textAlign: 'center', py: 6 }}>
      <StorageOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
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

// `advertised_epsilon` is null on requests made before requesters could propose a budget,
// so every comparison has to survive a missing number. Reject null/''/undefined before
// coercing — `Number(null)` and `Number('')` are both 0, which would read as a real
// budget of ε 0 and make every legacy request look like a weaker-privacy ask.
const epsOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtEps = (n) => (n == null ? '—' : String(Number(n.toFixed(2))));

const IncomingCard = ({ request, busy, onRespond }) => {
  const { status } = request;
  const requested = epsOf(request.requested_epsilon ?? request.epsilon);
  const advertised = epsOf(request.advertised_epsilon);
  const gap = requested != null && advertised != null ? requested - advertised : null;
  const weaker = gap != null && gap > 0;
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <CardHeader
          title={request.phenotype || 'Dataset'}
          subtitle={(
            <>
              Requested by {request.requester_name || 'a user'} ·{' '}
              <Tooltip title={fmtExact(request.created_at)}>
                <Box component="span" sx={{ textDecoration: 'underline dotted' }}>
                  {fmtWhen(request.created_at)}
                </Box>
              </Tooltip>
            </>
          )}
          status={status}
        />

        <PurposeBlock purpose={request.purpose} />

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<ShieldOutlinedIcon fontSize="small" />}>
            They asked for ε = {fmtEps(requested)}
            {request.mechanism ? ` (${request.mechanism})` : ''} · you advertised{' '}
            {advertised != null
              ? `ε = ${fmtEps(advertised)}`
              : 'a budget that was not recorded on this request'}
          </MetaRow>
          {weaker && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              icon={<WarningAmberIcon />}
              label={`Weaker privacy than you advertised — ε ${fmtEps(gap)} higher`}
              sx={{ alignSelf: 'flex-start' }}
            />
          )}
          {weaker && (
            <Typography variant="body2" color="text.secondary">
              A higher ε means less noise, so the copy would sit closer to your real data than
              the terms you published. Denying is a legitimate answer.
            </Typography>
          )}
          {gap != null && !weaker && (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              icon={<ShieldOutlinedIcon />}
              label={gap === 0
                ? 'Exactly the budget you advertised'
                : `Stronger than you advertised — ε ${fmtEps(-gap)} lower`}
              sx={{ alignSelf: 'flex-start' }}
            />
          )}
          {requested != null && advertised == null && (
            <Typography variant="body2" color="text.secondary">
              This request predates the advertised-budget record, so there is nothing to compare it
              against. Check it against the budget currently set on the dataset in My Data.
            </Typography>
          )}
          {request.responded_at && (
            <MetaRow icon={<EventIcon fontSize="small" />}>
              You responded {fmtWhen(request.responded_at)} ({fmtExact(request.responded_at)})
            </MetaRow>
          )}
        </Stack>

        {status === 'pending' && (
          <>
            <Alert severity={weaker ? 'warning' : 'info'} sx={{ mt: 2 }}>
              If you approve, your own Site Agent produces the differentially-private copy on your
              machine at the requested ε = {fmtEps(requested)}
              {advertised != null && gap !== 0 ? `, not at the ε = ${fmtEps(advertised)} you advertised` : ''}
              . Your raw data never moves. Make sure your agent is running, or the request will
              sit at &quot;transforming&quot; until it is.
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
                {busy ? 'Sending…' : requested != null ? `Approve at ε = ${fmtEps(requested)}` : 'Approve'}
              </Button>
            </Stack>
          </>
        )}

        {status === 'transforming' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Your Site Agent is applying the differential-privacy transform locally. The private
              copy is built on your machine and only that copy is handed over.
            </Typography>
            <LinearProgress sx={{ mt: 1.25, borderRadius: 1 }} />
          </Box>
        )}

        {status === 'ready' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Your agent finished the private copy at ε = {fmtEps(requested)}
            {sizePhrase(request) ? ` (${sizePhrase(request)})` : ''}
            . {request.requester_name || 'The requester'} can now download it.
          </Alert>
        )}

        {status === 'downloaded' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {request.requester_name || 'The requester'} collected the copy
            {request.downloaded_at ? ` ${fmtWhen(request.downloaded_at)}` : ''} at ε = {fmtEps(requested)}
            {sizePhrase(request) ? ` (${sizePhrase(request)})` : ''}. The server no longer holds it.
          </Typography>
        )}

        {status === 'failed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {request.error || 'Your Site Agent could not complete the privacy transform.'}
          </Alert>
        )}

        {status === 'denied' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            You denied this request. Nothing was shared.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Once the owner has approved, `epsilon` is the budget the copy was actually produced
// at. Before that it is only the number that was asked for, so the two are labelled
// apart rather than shown as one bare ε the requester has to guess the meaning of.
const PRODUCED = ['ready', 'downloading', 'downloaded'];

const OutgoingCard = ({ request, downloading, onDownload }) => {
  const { status } = request;
  const asked = epsOf(request.requested_epsilon ?? request.epsilon);
  const produced = PRODUCED.includes(status) ? epsOf(request.epsilon) : null;
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <CardHeader
          title={request.phenotype || 'Dataset'}
          subtitle={(
            <>
              From {request.owner_name || 'the owner'} ·{' '}
              <Tooltip title={fmtExact(request.created_at)}>
                <Box component="span" sx={{ textDecoration: 'underline dotted' }}>
                  asked {fmtWhen(request.created_at)}
                </Box>
              </Tooltip>
            </>
          )}
          status={status}
        />

        <PurposeBlock purpose={request.purpose} />

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" />}>
            Owner: {request.owner_name || '—'}
          </MetaRow>
          <MetaRow icon={<ShieldOutlinedIcon fontSize="small" />}>
            You asked for ε = {fmtEps(asked)}
            {produced != null ? ` · produced at ε = ${fmtEps(produced)}` : ''}
            {' '}· mechanism: {request.mechanism || '—'}
          </MetaRow>
          {sizePhrase(request) && (
            <MetaRow icon={<StorageOutlinedIcon fontSize="small" />}>
              {sizePhrase(request)}
            </MetaRow>
          )}
        </Stack>

        {status === 'pending' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Waiting for {request.owner_name || 'the owner'} to approve or deny.
          </Typography>
        )}

        {status === 'transforming' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Approved. {request.owner_name || 'The owner'}&apos;s Site Agent is applying
              differential privacy to the data on their own machine. You will be able to download
              the private copy as soon as it finishes.
            </Typography>
            <LinearProgress sx={{ mt: 1.25, borderRadius: 1 }} />
          </Box>
        )}

        {status === 'ready' && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="warning">
              <AlertTitle>This is a one-time download</AlertTitle>
              The server erases its copy the moment the file is served, so this button works
              exactly once. Save the CSV somewhere you can find again — if it is lost,{' '}
              {request.owner_name || 'the owner'} has to approve a fresh request before you can
              get it a second time.
            </Alert>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }} justifyContent="flex-end">
              <Button
                variant="contained" disabled={downloading}
                startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />}
                onClick={() => onDownload(request)}
              >
                {downloading ? 'Preparing…' : 'Download CSV'}
              </Button>
            </Stack>
          </Box>
        )}

        {status === 'downloading' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              The handover is in progress. Check your browser downloads for the CSV — the server
              erases its copy as soon as this finishes.
            </Typography>
            <LinearProgress sx={{ mt: 1.25, borderRadius: 1 }} />
          </Box>
        )}

        {status === 'downloaded' && (
          <Alert severity="success" icon={<DownloadDoneIcon fontSize="inherit" />} sx={{ mt: 2 }}>
            <AlertTitle>Collected — the record is kept, the data is not</AlertTitle>
            <Typography variant="body2">
              Downloaded{' '}
              <Tooltip title={fmtExact(request.downloaded_at)}>
                <Box component="span" sx={{ textDecoration: 'underline dotted' }}>
                  {fmtWhen(request.downloaded_at)}
                </Box>
              </Tooltip>
              {' '}at ε = {fmtEps(produced ?? asked)}
              {request.mechanism ? ` (${request.mechanism})` : ''}
              {sizePhrase(request) ? ` — ${sizePhrase(request)}.` : '.'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75 }}>
              The server no longer holds a copy; only this record of what was shared survives. The
              file you saved is the only one.
            </Typography>
          </Alert>
        )}

        {status === 'failed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {request.error || 'The privacy transform failed on the owner’s machine.'}
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

const DataRequests = () => {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const resp = await axios.get(`${URL}/api/data-requests`, { headers: authHeader() });
      setIncoming(Array.isArray(resp?.data?.incoming) ? resp.data.incoming : []);
      setOutgoing(Array.isArray(resp?.data?.outgoing) ? resp.data.outgoing : []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load data requests');
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
        `${URL}/api/data-requests/${request.request_id}/respond`,
        { decision },
        { headers: authHeader() },
      );
      setSnackbar({
        open: true,
        severity: decision === 'approve' ? 'success' : 'info',
        message: decision === 'approve'
          ? `Approved at ε = ${fmtEps(epsOf(request.requested_epsilon ?? request.epsilon))}. Your Site Agent will now build the private copy on your machine — keep it running.`
          : 'Request denied. Nothing was shared.',
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

  const download = async (request) => {
    setDownloadingId(request.request_id);
    try {
      const resp = await axios.get(
        `${URL}/api/data-requests/${request.request_id}/download`,
        { headers: authHeader() },
      );
      const blob = new Blob([resp?.data?.csv || ''], { type: 'text/csv' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeName(resp?.data?.phenotype || request.phenotype)}_private.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoke on a later tick, never synchronously after click(). The server has
      // already erased its only copy by the time this response arrives, so a save
      // that the browser abandons because the blob URL vanished mid-commit loses
      // the data outright — there is nothing left to download a second time.
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
      const n = resp?.data?.sample_count;
      const m = resp?.data?.snp_count;
      setSnackbar({
        open: true,
        severity: 'success',
        message: n != null
          ? `Downloaded ${n} samples${m != null ? ` × ${m} attributes` : ''}. Keep the file — the server's copy is gone.`
          : 'Download complete. Keep the file — the server’s copy is gone.',
      });
      // Flip the card to `downloaded`; the button must not be offered again.
      await load(true);
    } catch (err) {
      const httpStatus = err?.response?.status;
      const body = err?.response?.data || {};
      // 410 = already served and erased (a second tab, typically); 409 = a download
      // is already in flight. Neither is a client fault — the list is just stale.
      const stale = httpStatus === 410 || httpStatus === 409;
      setSnackbar({
        open: true,
        severity: httpStatus === 410 ? 'info' : (stale ? 'warning' : 'error'),
        message: [body.error, body.hint].filter(Boolean).join(' ') || err.message || 'Download failed',
      });
      if (stale) await load(true);
    } finally {
      setDownloadingId(null);
    }
  };

  const showEmptyShell = loading && incoming.length === 0 && outgoing.length === 0;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" gutterBottom>Data Requests</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 780 }}>
            Requests to share datasets between sites. When a request is approved, the owner&apos;s
            Site Agent applies a differential-privacy transform locally and only that protected copy
            is handed over — raw data files never leave the machine they live on.
          </Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => load(false)} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{relabel(error)}</Alert>}

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
            title="No one has requested your data yet."
            body="Mark a dataset as shareable in My Data and advertise the privacy budget you are
              willing to release it at. Requesters can ask for a different ε, and you see what they
              asked for before you approve or deny."
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
          title="You haven't requested any data yet."
          body="Find a site with a shareable dataset under Find Collaborators and ask for it. Your
            requests and their status will be tracked here."
        />
      ) : (
        <Stack spacing={2}>
          {outgoing.map((r) => (
            <OutgoingCard
              key={r.request_id}
              request={r}
              downloading={downloadingId === r.request_id}
              onDownload={download}
            />
          ))}
        </Stack>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {relabel(snackbar.message)}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default DataRequests;
