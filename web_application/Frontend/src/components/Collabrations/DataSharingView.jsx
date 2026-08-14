import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider,
  Grid, LinearProgress, Snackbar, Stack, Tooltip, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/HourglassTop';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import axios from 'axios';
import URL from '../../config';

const POLL_INTERVAL_MS = 3000;

const STAGE_LABELS = {
  idle: { label: 'Not started', color: 'default' },
  waiting_for_responses: { label: 'Waiting for invitees', color: 'warning' },
  transforming: { label: 'Applying privacy transform', color: 'info' },
  complete: { label: 'Ready to share', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const StatusDot = ({ status }) => {
  if (status === 'accepted') return <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />;
  if (status === 'rejected' || status === 'withdrawn') return <CancelIcon fontSize="small" sx={{ color: 'error.main' }} />;
  return <PendingIcon fontSize="small" sx={{ color: 'warning.main' }} />;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const DataSharingView = ({ collaboration }) => {
  const uuid = collaboration?.uuid;
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [isKicking, setIsKicking] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const pollTimer = useRef(null);

  const fetchState = useCallback(async () => {
    if (!uuid) return;
    try {
      const resp = await axios.get(`${URL}/api/datasharing/state/${uuid}`, { headers: authHeader() });
      setState(resp.data);
      setFetchError(null);
    } catch (err) {
      setFetchError(err?.response?.data?.error || err.message || 'Failed to load state');
    } finally {
      setLoaded(true);
    }
  }, [uuid]);

  useEffect(() => {
    fetchState();
    pollTimer.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchState]);

  const stage = state?.stage || 'idle';
  const stageInfo = STAGE_LABELS[stage] || { label: stage, color: 'default' };
  const isInitiator = state?.is_initiator === true;
  const participants = state?.participants || [];
  const epsilon = state?.config?.epsilon;
  const anyPending = participants.some(p => (p.status || 'pending') === 'pending');
  const acceptedParticipants = participants.filter(p => (p.status || 'pending') === 'accepted');
  const doneCount = acceptedParticipants.filter(p => p.transformed).length;
  // The initiator should always have a way to (re)run once invitees have responded —
  // this is the recovery path if a transform fails or a run gets stuck.
  const canRerun = isInitiator && !anyPending && stage !== 'waiting_for_responses';

  const kickoff = async () => {
    setIsKicking(true);
    try {
      await axios.post(`${URL}/api/datasharing/kickoff/${uuid}`, null, { headers: authHeader() });
      setSnackbar({ open: true, message: 'Privacy transform queued for all participants.', severity: 'success' });
      fetchState();
    } catch (err) {
      setSnackbar({ open: true, message: `Failed: ${err?.response?.data?.error || err.message}`, severity: 'error' });
    } finally {
      setIsKicking(false);
    }
  };

  const download = async (p) => {
    setDownloadingId(p.user_id);
    try {
      const resp = await axios.get(`${URL}/api/datasharing/${uuid}/data/${p.user_id}/download`, { headers: authHeader() });
      const blob = new Blob([resp.data.csv || ''], { type: 'text/csv' });
      const safe = (p.name || 'participant').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'participant';
      const link = document.createElement('a');
      const objectUrl = window.URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${safe}_privacy_shared.csv`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(link);
      setSnackbar({ open: true, message: 'Shared dataset downloaded.', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Download failed: ${err?.response?.data?.error || err.message}`, severity: 'error' });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!loaded) {
    return (
      <Container maxWidth="lg" sx={{ mt: 6, mb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Loading Data Sharing…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {state?.collab_name || collaboration?.collab_name || collaboration?.name || 'Data Sharing collaboration'}
            </Typography>
            <Chip icon={<ShieldOutlinedIcon />} label="Data Sharing" color="secondary" variant="outlined" />
            <Chip label={stageInfo.label} color={stageInfo.color} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Each participant&apos;s local agent applies a differential-privacy transform
            (randomized-response noise on genotypes + row shuffle{epsilon != null ? `, ε = ${epsilon}` : ''}) to its
            own dataset. Only the privacy-protected copy is shared — raw genotypes never leave a site, and no
            KING coefficients or pairwise analysis are computed. Every participant can download every
            participant&apos;s shared copy below.
          </Typography>
          {fetchError && <Alert severity="warning" sx={{ mt: 2 }}>{fetchError}</Alert>}
        </CardContent>
      </Card>

      {anyPending && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Waiting for all invitees to respond. The privacy transform starts automatically once everyone has
          accepted or rejected.
        </Alert>
      )}

      {(stage === 'transforming') && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Applying privacy transform… ({doneCount}/{acceptedParticipants.length} ready)
              </Typography>
              {canRerun && (
                <Tooltip title="Not progressing? Re-queue the transform for everyone">
                  <span>
                    <Button size="small" onClick={kickoff} disabled={isKicking}>
                      {isKicking ? <CircularProgress size={16} /> : 'Re-run'}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
            <LinearProgress sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}

      {isInitiator && (stage === 'idle' || stage === 'failed') && !anyPending && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {stage === 'failed' ? 'A transform failed' : 'Ready to run'}
            </Typography>
            <Button variant="contained" sx={{ mt: 1.5 }} onClick={kickoff} disabled={isKicking}>
              {isKicking ? <CircularProgress size={20} /> : 'Run privacy transform'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Participants &amp; shared data ({participants.length})
            </Typography>
            {canRerun && (
              <Tooltip title="Re-run the privacy transform for everyone">
                <span>
                  <Button size="small" onClick={kickoff} disabled={isKicking}>
                    {isKicking ? <CircularProgress size={16} /> : 'Re-run'}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
          <Grid container spacing={1.5}>
            {participants.map((p, idx) => {
              const accepted = (p.status || 'pending') === 'accepted';
              return (
                <Grid item xs={12} md={6} key={`${p.user_id}-${idx}`}>
                  <Stack direction="row" alignItems="center" spacing={1.5}
                    sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, height: '100%' }}>
                    <StatusDot status={p.status || 'pending'} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {p.name || p.user_id}
                        {p.user_id === state?.creator_id && <Chip label="initiator" size="small" sx={{ ml: 1 }} />}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {!accepted ? `status: ${p.status || 'pending'}`
                          : p.transformed
                            ? `shared${p.n_samples != null ? ` · ${p.n_samples} samples${p.n_snps != null ? ` × ${p.n_snps} SNPs` : ''}` : ''}`
                            : p.job === 'failed' ? 'transform failed' : 'transforming…'}
                      </Typography>
                    </Box>
                    {accepted && p.transformed ? (
                      <Button size="small" variant="outlined"
                        startIcon={downloadingId === p.user_id ? <CircularProgress size={14} /> : <DownloadRoundedIcon />}
                        onClick={() => download(p)} disabled={downloadingId === p.user_id}>
                        Download
                      </Button>
                    ) : accepted && p.job === 'failed' ? (
                      <Chip size="small" color="error" label="failed" variant="outlined" />
                    ) : accepted ? (
                      <CircularProgress size={18} />
                    ) : null}
                  </Stack>
                </Grid>
              );
            })}
          </Grid>
          {participants.some(p => p.status === 'accepted' && p.job === 'failed' && p.error) && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {participants.filter(p => p.job === 'failed' && p.error).map(p => `${p.name}: ${p.error}`).join(' · ')}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default DataSharingView;
