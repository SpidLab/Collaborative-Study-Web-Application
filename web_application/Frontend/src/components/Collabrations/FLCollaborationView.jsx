import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider,
  Grid, LinearProgress, Slider, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Tooltip
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/HourglassTop';
import axios from 'axios';
import URL from '../../config';

const STAGE_LABELS = {
  idle: { label: 'Waiting for invitees', color: 'default' },
  projecting: { label: 'Projecting (public PCA + DP)', color: 'info' },
  computing_emd: { label: 'Computing EMD matrix', color: 'info' },
  awaiting_threshold: { label: 'Awaiting EMD threshold', color: 'warning' },
  ready_to_train: { label: 'Ready to train', color: 'success' },
  training: { label: 'Federated training', color: 'info' },
  complete: { label: 'Training complete', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const POLL_INTERVAL_MS = 3000;

const formatMetric = (v) => {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? v.toString() : v.toFixed(4);
};

const StatusDot = ({ status }) => {
  if (status === 'accepted') return <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />;
  if (status === 'rejected' || status === 'withdrawn' || status === 'revoked')
    return <CancelIcon fontSize="small" sx={{ color: 'error.main' }} />;
  return <PendingIcon fontSize="small" sx={{ color: 'warning.main' }} />;
};

const FLCollaborationView = ({ collaboration }) => {
  const uuid = collaboration?.uuid;
  const isInitiator = collaboration?.is_sender === true ||
    (collaboration?.creator_id && collaboration?.current_user_id &&
      String(collaboration.creator_id) === String(collaboration.current_user_id));
  const creatorIdStr = collaboration?.creator_id ? String(collaboration.creator_id) : null;

  const [fetchError, setFetchError] = useState(null);
  const [flState, setFlState] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [pendingThreshold, setPendingThreshold] = useState(null);
  const [isApplyingThreshold, setIsApplyingThreshold] = useState(false);
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [isKickingOff, setIsKickingOff] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [numRounds, setNumRounds] = useState(null);
  const [localEpochs, setLocalEpochs] = useState(null);
  const pollTimer = useRef(null);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchState = useCallback(async () => {
    if (!uuid) return;
    try {
      const resp = await axios.get(`${URL}/api/fl/state/${uuid}`, { headers: authHeader() });
      const state = resp?.data?.fl_state || null;
      setFlState(state);
      setFetchError(null);
      if (state?.config) {
        if (pendingThreshold === null && typeof state.config.emd_threshold === 'number') {
          setPendingThreshold(state.config.emd_threshold);
        }
        if (numRounds === null && state.config.num_rounds) setNumRounds(state.config.num_rounds);
        if (localEpochs === null && state.config.local_epochs) setLocalEpochs(state.config.local_epochs);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to load FL state';
      setFetchError(msg);
    }
  }, [uuid, pendingThreshold, numRounds, localEpochs]);

  useEffect(() => {
    fetchState();
    pollTimer.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchState]);

  const stage = flState?.stage || 'idle';
  const stageInfo = STAGE_LABELS[stage] || { label: stage, color: 'default' };
  const config = flState?.config || {};
  const survivors = flState?.survivors_preview || [];
  const emd = flState?.emd || null;
  const history = flState?.training_history || [];
  const finalMetrics = flState?.final_metrics || {};
  const siteAssignments = flState?.site_assignments || {};
  const trainingProgress = flState?.training_progress || null;

  // Stall detection: if stage is "training" but the heartbeat is missing
  // (doc predates this code / process died before first round) or older than
  // ~90s, the training process is gone (e.g. server restart / OOM).
  const heartbeatStale = (() => {
    if (stage !== 'training') return false;
    const hb = flState?.training_heartbeat;
    if (!hb) return true;
    const age = Date.now() - new Date(hb).getTime();
    return age > 90 * 1000;
  })();

  const emdRange = useMemo(() => {
    if (!emd?.matrix) return { min: 0, max: 5 };
    let min = Infinity, max = 0;
    emd.matrix.forEach(row => row.forEach(v => {
      if (v > max) max = v;
      if (v > 0 && v < min) min = v;
    }));
    if (!Number.isFinite(min)) min = 0;
    return {
      min: Number(min.toFixed(3)),
      max: Number((max * 1.2 || 5).toFixed(3)),
    };
  }, [emd]);

  const applyThreshold = async () => {
    if (pendingThreshold === null) return;
    setIsApplyingThreshold(true);
    try {
      await axios.post(`${URL}/api/fl/apply_threshold`,
        { uuid, threshold: Number(pendingThreshold) },
        { headers: authHeader() });
      setSnackbar({ open: true, message: 'Threshold applied.', severity: 'success' });
      fetchState();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setSnackbar({ open: true, message: `Apply failed: ${msg}`, severity: 'error' });
    } finally {
      setIsApplyingThreshold(false);
    }
  };

  const startTraining = async () => {
    setIsStartingTraining(true);
    try {
      const payload = { uuid };
      if (numRounds) payload.num_rounds = Number(numRounds);
      if (localEpochs) payload.local_epochs = Number(localEpochs);
      await axios.post(`${URL}/api/fl/start_training`, payload, { headers: authHeader() });
      setSnackbar({ open: true, message: 'Training started.', severity: 'success' });
      fetchState();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setSnackbar({ open: true, message: `Start failed: ${msg}`, severity: 'error' });
    } finally {
      setIsStartingTraining(false);
    }
  };

  const kickoff = async () => {
    setIsKickingOff(true);
    try {
      await axios.post(`${URL}/api/fl/kickoff/${uuid}`, null, { headers: authHeader() });
      setSnackbar({ open: true, message: 'FL pipeline re-kicked.', severity: 'success' });
      fetchState();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setSnackbar({ open: true, message: `Kickoff failed: ${msg}`, severity: 'error' });
    } finally {
      setIsKickingOff(false);
    }
  };

  const resetTraining = async () => {
    setIsResetting(true);
    try {
      await axios.post(`${URL}/api/fl/reset_training`, { uuid }, { headers: authHeader() });
      setSnackbar({ open: true, message: 'Training reset — you can start again.', severity: 'success' });
      fetchState();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setSnackbar({ open: true, message: `Reset failed: ${msg}`, severity: 'error' });
    } finally {
      setIsResetting(false);
    }
  };

  const allParticipants = collaboration?.invitedUsers || collaboration?.all_participants || [];
  const anyPending = allParticipants.some(p => (p.status || 'pending') === 'pending');

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 4 }}>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {collaboration?.collab_name || collaboration?.name || 'Federated Learning collaboration'}
            </Typography>
            <Chip label="Federated Learning" color="primary" variant="outlined" />
            <Chip label={stageInfo.label} color={stageInfo.color} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Goal: train a shared 1D-CNN genotype → super-population classifier across the sites
            whose data distributions (via public PCA + ε-LDP projections) survive the initiator&apos;s
            Earth Mover&apos;s Distance threshold. Powered by Flower FedAvg.
          </Typography>
          {fetchError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {fetchError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Participants */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Participants ({allParticipants.length})
          </Typography>
          <Grid container spacing={1}>
            {allParticipants.map((p, idx) => {
              const uidStr = String(p.user_id || p._id || '');
              const site = siteAssignments[uidStr];
              const isCreator = creatorIdStr && uidStr === creatorIdStr;
              return (
                <Grid item xs={12} md={6} key={`${uidStr}-${idx}`}>
                  <Stack direction="row" alignItems="center" spacing={1.5}
                    sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <StatusDot status={p.status || 'pending'} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {p.name || p.email || uidStr}
                        {isCreator && <Chip label="initiator" size="small" sx={{ ml: 1 }} />}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        status: {p.status || 'pending'} {site ? `· synpop site ${site}` : ''}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              );
            })}
          </Grid>
          {anyPending && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Waiting for all invitees to respond. The FL pipeline auto-starts once every invitee has accepted or rejected.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Stage-specific content */}
      {stage === 'idle' && isInitiator && !anyPending && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>FL pipeline has not started yet</Typography>
            <Button variant="contained" sx={{ mt: 1.5 }} onClick={kickoff} disabled={isKickingOff}>
              {isKickingOff ? <CircularProgress size={20} /> : 'Kick off PCA + EMD'}
            </Button>
          </CardContent>
        </Card>
      )}

      {(stage === 'projecting' || stage === 'computing_emd') && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {stageInfo.label}…
            </Typography>
            <LinearProgress sx={{ mt: 2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Sites are projecting their local genotype matrices through the public PCA model and
              adding ε = {config.epsilon} Laplace noise. The server will then assemble the pairwise
              EMD matrix.
            </Typography>
          </CardContent>
        </Card>
      )}

      {stage === 'failed' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2">FL pipeline failed</Typography>
          <Typography variant="body2">{flState?.error || 'Unknown error'}</Typography>
          {isInitiator && (
            <Button sx={{ mt: 1 }} size="small" variant="outlined" onClick={kickoff} disabled={isKickingOff}>
              Retry
            </Button>
          )}
        </Alert>
      )}

      {(stage === 'awaiting_threshold' || stage === 'ready_to_train' || stage === 'training' || stage === 'complete') && emd && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Pairwise EMD (Earth Mover&apos;s Distance) matrix
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Lower = more similar PCA-projected distributions. Distances computed on ε-LDP-protected
              projections using the sliced Wasserstein approximation.
            </Typography>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    {emd.client_order.map(cid => (
                      <TableCell key={cid} sx={{ fontWeight: 600 }}>
                        {cid === creatorIdStr ? 'initiator' : `client ${cid.slice(-6)}`}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {emd.client_order.map((rowCid, i) => (
                    <TableRow key={rowCid}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {rowCid === creatorIdStr ? 'initiator' : `client ${rowCid.slice(-6)}`}
                      </TableCell>
                      {emd.client_order.map((colCid, j) => {
                        const val = emd.matrix?.[i]?.[j] ?? 0;
                        const isDiag = i === j;
                        return (
                          <TableCell key={colCid} sx={{
                            background: isDiag ? '#f5f5f5' : (val <= (flState?.config?.emd_threshold ?? 1.0) ? '#e8f5e9' : '#fff3e0'),
                            fontFamily: 'monospace',
                          }}>
                            {isDiag ? '·' : val.toFixed(3)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {isInitiator && (stage === 'awaiting_threshold' || stage === 'ready_to_train') && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              EMD threshold
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Collaborators with EMD ≤ threshold will be invited into federated training.
              Current: <b>{pendingThreshold ?? config.emd_threshold ?? '—'}</b>
            </Typography>
            <Slider
              value={pendingThreshold ?? config.emd_threshold ?? 1}
              onChange={(_, v) => setPendingThreshold(Array.isArray(v) ? v[0] : v)}
              min={emdRange.min}
              max={emdRange.max}
              step={0.01}
              valueLabelDisplay="auto"
              sx={{ mt: 1 }}
            />
            <Button variant="contained" size="small" onClick={applyThreshold}
              disabled={isApplyingThreshold || pendingThreshold === null}>
              {isApplyingThreshold ? <CircularProgress size={18} /> : 'Apply threshold'}
            </Button>
          </CardContent>
        </Card>
      )}

      {survivors.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Survivor preview
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>EMD to initiator</TableCell>
                    <TableCell>Survives?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {survivors.map(row => (
                    <TableRow key={row.client_id}>
                      <TableCell>
                        {row.client_id === creatorIdStr ? 'initiator' : `client ${row.client_id.slice(-6)}`}
                      </TableCell>
                      <TableCell>{row.emd?.toFixed(3)}</TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={row.survives ? 'yes' : 'no'}
                          color={row.survives ? 'success' : 'default'}
                          variant={row.survives ? 'filled' : 'outlined'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {isInitiator && stage === 'ready_to_train' && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Start federated training
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  size="small" fullWidth label="Rounds"
                  type="number" value={numRounds ?? ''}
                  onChange={e => setNumRounds(e.target.value)}
                  inputProps={{ min: 1, max: 50 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  size="small" fullWidth label="Local epochs / round"
                  type="number" value={localEpochs ?? ''}
                  onChange={e => setLocalEpochs(e.target.value)}
                  inputProps={{ min: 1, max: 10 }}
                />
              </Grid>
            </Grid>
            <Button variant="contained" onClick={startTraining} disabled={isStartingTraining}>
              {isStartingTraining ? <CircularProgress size={20} /> : 'Start FedAvg training'}
            </Button>
          </CardContent>
        </Card>
      )}

      {(stage === 'training' || stage === 'complete') && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Federated training {stage === 'complete' ? '— complete' : 'in progress…'}
              {stage === 'training' && trainingProgress &&
                ` (round ${trainingProgress.current_round}/${trainingProgress.total_rounds})`}
            </Typography>
            {stage === 'training' && !heartbeatStale && <LinearProgress sx={{ mb: 2 }} />}
            {stage === 'training' && heartbeatStale && isInitiator && (
              <Alert severity="warning" sx={{ mb: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={resetTraining} disabled={isResetting}>
                    {isResetting ? <CircularProgress size={16} /> : 'Reset & retry'}
                  </Button>
                }>
                Training appears to have stalled (no progress for &gt;90s). The server may have
                restarted or run out of memory. Reset to start again.
              </Alert>
            )}
            {history.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Phase</TableCell>
                      <TableCell>Train loss</TableCell>
                      <TableCell>Accuracy</TableCell>
                      <TableCell>F1 (macro)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.phase}</TableCell>
                        <TableCell>{formatMetric(row.train_loss)}</TableCell>
                        <TableCell>{formatMetric(row.accuracy)}</TableCell>
                        <TableCell>{formatMetric(row.f1_macro)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {stage === 'complete' && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f5fff7', border: '1px solid #a5d6a7', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Final global model</Typography>
                <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap">
                  <Typography variant="body2">accuracy: <b>{formatMetric(finalMetrics.accuracy)}</b></Typography>
                  <Typography variant="body2">F1 (macro): <b>{formatMetric(finalMetrics.f1_macro)}</b></Typography>
                  <Typography variant="body2">val loss: <b>{formatMetric(finalMetrics.train_loss)}</b></Typography>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

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

export default FLCollaborationView;
