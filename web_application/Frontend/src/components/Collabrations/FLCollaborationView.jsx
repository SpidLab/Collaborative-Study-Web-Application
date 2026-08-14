import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  FormControlLabel, Grid, LinearProgress, Slider, Snackbar, Stack, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/HourglassTop';
import PublicIcon from '@mui/icons-material/Public';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ComputerIcon from '@mui/icons-material/Computer';
import { Link as RouterLink } from 'react-router-dom';
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

  const [fetchError, setFetchError] = useState(null);
  const [flState, setFlState] = useState(null);
  // Authoritative identity comes from /api/fl/state (server compares the JWT's
  // user against the collaboration's creator_id). We fall back to the props
  // threaded in from the parent only until that first response lands.
  const [flIdentity, setFlIdentity] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [pendingThreshold, setPendingThreshold] = useState(null);
  const [isApplyingThreshold, setIsApplyingThreshold] = useState(false);
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [isKickingOff, setIsKickingOff] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
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
      setFlIdentity({
        creator_id: resp?.data?.creator_id ?? null,
        current_user_id: resp?.data?.current_user_id ?? null,
        is_initiator: resp?.data?.is_initiator === true,
        published_model_id: resp?.data?.published_model_id ?? null,
        model_visibility: resp?.data?.model_visibility ?? null,
        allow_inference_requests: resp?.data?.allow_inference_requests === true,
        model_delivered_to_me: resp?.data?.model_delivered_to_me === true,
        model_delivery: resp?.data?.model_delivery ?? null,
      });
      setFetchError(null);
      // Seed the editable controls from the server config exactly once (whatever
      // the user has typed/dragged since then wins). These use functional updates
      // so `fetchState` does not have to depend on that state — if it did, every
      // slider drag would rebuild the poll and fire an extra request.
      const cfg = state?.config;
      if (cfg) {
        if (typeof cfg.emd_threshold === 'number') {
          setPendingThreshold(prev => (prev === null ? cfg.emd_threshold : prev));
        }
        if (cfg.num_rounds) setNumRounds(prev => (prev === null ? cfg.num_rounds : prev));
        if (cfg.local_epochs) setLocalEpochs(prev => (prev === null ? cfg.local_epochs : prev));
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to load FL state';
      setFetchError(msg);
    }
  }, [uuid]);

  useEffect(() => {
    fetchState();
    pollTimer.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchState]);

  // Prefer the server's authoritative answer; fall back to the props threaded
  // from the parent (used only for the brief window before the first fl/state
  // response, or if that endpoint can't authenticate).
  const creatorIdStr = flIdentity?.creator_id
    ? String(flIdentity.creator_id)
    : (collaboration?.creator_id ? String(collaboration.creator_id) : null);
  const isInitiator = flIdentity
    ? (flIdentity.is_initiator === true ||
        (!!flIdentity.creator_id && !!flIdentity.current_user_id &&
          String(flIdentity.creator_id) === String(flIdentity.current_user_id)))
    : (collaboration?.is_sender === true ||
        (!!collaboration?.creator_id && !!collaboration?.current_user_id &&
          String(collaboration.creator_id) === String(collaboration.current_user_id)));
  const publishedModelId = flIdentity?.published_model_id || null;
  const modelListed = !!publishedModelId; // backend breadcrumb — the catalog entry exists
  const modelIsPublic = flIdentity?.model_visibility === 'public';
  const allowsInference = flIdentity?.allow_inference_requests === true;
  const modelDeliveredToMe = flIdentity?.model_delivered_to_me === true;
  const delivery = flIdentity?.model_delivery || null;
  const deliveredCount = typeof delivery?.delivered === 'number' ? delivery.delivered : null;
  const deliveryTargets = typeof delivery?.targets === 'number' ? delivery.targets : null;
  const deliveryComplete =
    deliveredCount !== null && deliveryTargets !== null && deliveryTargets > 0 && deliveredCount >= deliveryTargets;
  // A private model is kept by the initiator alone; participating sites get no copy.
  const initiatorOnlyDelivery = delivery?.scope === 'initiator';

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

  const patchModel = async (patch, message) => {
    if (!publishedModelId) return;
    setIsSavingModel(true);
    try {
      await axios.patch(`${URL}/api/models/${publishedModelId}`, patch, { headers: authHeader() });
      setSnackbar({ open: true, message, severity: 'success' });
      fetchState();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setSnackbar({ open: true, message: `Update failed: ${msg}`, severity: 'error' });
    } finally {
      setIsSavingModel(false);
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
                  {finalMetrics.loss != null ? (
                    <Typography variant="body2">val loss: <b>{formatMetric(finalMetrics.loss)}</b></Typography>
                  ) : (
                    <Typography variant="body2">train loss: <b>{formatMetric(finalMetrics.train_loss)}</b></Typography>
                  )}
                </Stack>

                <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #a5d6a7' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Model Repository listing
                  </Typography>
                  {modelListed ? (
                    <>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          color={modelIsPublic ? 'success' : 'default'}
                          variant={modelIsPublic ? 'filled' : 'outlined'}
                          icon={modelIsPublic ? <PublicIcon /> : <LockOutlinedIcon />}
                          label={modelIsPublic ? 'Listed publicly' : 'Listed privately'}
                        />
                        {/* A private entry is only listed for its owner (the initiator),
                            so don't send anyone else to a page that won't show it. */}
                        {(modelIsPublic || isInitiator) && (
                          <Button variant="outlined" size="small" component={RouterLink} to="/models">
                            View in Model Repository
                          </Button>
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {modelIsPublic
                          ? 'Any user can see this entry — its description, architecture and measured metrics. The Model Repository is a catalog only: the trained weights are never distributed to anyone.'
                          : isInitiator
                            ? 'Only you can see this entry. The Model Repository is a catalog only: the trained weights are never distributed to anyone, public or private.'
                            : 'The initiator has kept this entry unlisted, so it only shows in their Model Repository. The repository is a catalog only: the trained weights are never distributed to anyone, public or private.'}
                      </Typography>
                      {modelIsPublic && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {allowsInference
                            ? 'Other users can send inference requests against this model. Their samples are classified by the Site Agent on the machine that holds the model; the model itself does not move.'
                            : 'Inference requests are turned off, so the entry is view-only for other users.'}
                        </Typography>
                      )}
                      {isInitiator && (
                        <Box sx={{ mt: 1.5 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={modelIsPublic}
                                disabled={isSavingModel}
                                onChange={(e) => patchModel(
                                  { visibility: e.target.checked ? 'public' : 'private' },
                                  e.target.checked ? 'Model is now listed publicly.' : 'Model is now listed privately.'
                                )}
                              />
                            }
                            label={<Typography variant="body2">List this model publicly</Typography>}
                          />
                          {modelIsPublic && (
                            <Box>
                              <FormControlLabel
                                control={
                                  <Switch
                                    size="small"
                                    checked={allowsInference}
                                    disabled={isSavingModel}
                                    onChange={(e) => patchModel(
                                      { allow_inference_requests: e.target.checked },
                                      e.target.checked ? 'Inference requests enabled.' : 'Inference requests disabled.'
                                    )}
                                  />
                                }
                                label={<Typography variant="body2">Accept inference requests</Typography>}
                              />
                            </Box>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            You can change this at any time, including making a model public long after the
                            collaboration finished.
                          </Typography>
                        </Box>
                      )}
                    </>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Registering this global model in the Model Repository…
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #a5d6a7' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Where the trained model is
                  </Typography>
                  {modelDeliveredToMe ? (
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <ComputerIcon fontSize="small" sx={{ color: 'success.main', mt: 0.2 }} />
                      <Typography variant="body2">
                        The trained model was saved onto your own Site Agent machine. It stays there — nothing
                        about it is served from this web application.
                      </Typography>
                    </Stack>
                  ) : initiatorOnlyDelivery ? (
                    // Private was chosen at creation, so by design only the
                    // initiator's machine keeps the model. Say so, rather than
                    // leaving a collaborator waiting for a copy that is not coming.
                    <Typography variant="body2" color="text.secondary">
                      The initiator kept this model private, so it was saved onto their Site Agent
                      machine only. Participating sites do not receive a copy.
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      The trained model is written to each participating site&apos;s own Site Agent machine.
                      It has not landed on yours yet.
                    </Typography>
                  )}
                  {deliveryTargets > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, (deliveredCount / deliveryTargets) * 100)}
                        sx={{ borderRadius: 1, height: 6 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {initiatorOnlyDelivery
                          ? `Saved on ${deliveredCount} of ${deliveryTargets} machine (the initiator's — this model is private).`
                          : `Delivered to ${deliveredCount} of ${deliveryTargets} participating site${deliveryTargets === 1 ? '' : 's'}.`}
                        {!deliveryComplete && ' Sites whose Site Agent is offline will receive it when it reconnects.'}
                      </Typography>
                    </Box>
                  )}
                  {isInitiator && modelListed && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Changing visibility now changes who can see this entry in the Model Repository.
                      It does not move the model between machines — that was settled when training
                      finished.
                    </Typography>
                  )}
                </Box>
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
