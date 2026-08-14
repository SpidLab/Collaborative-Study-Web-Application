import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const MAX_SAMPLES_CAP = 500;
const DEFAULT_MAX_SAMPLES = 100;
// The server's 409 body says exactly this, so don't repeat it under the alert title.
const DUPLICATE_REQUEST_TITLE = 'You already have an open request for this model';

const RequestClassificationDialog = ({ open, model, onClose, onSubmitted }) => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [maxSamples, setMaxSamples] = useState(String(DEFAULT_MAX_SAMPLES));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState('');

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const resp = await axios.get(`${URL}/api/my-datasets`, { headers: authHeader() });
      const rows = Array.isArray(resp.data) ? resp.data : [];
      setDatasets(rows);
      setDatasetId(rows.length === 1 ? String(rows[0].id) : '');
    } catch (err) {
      setLoadError(err?.response?.data?.error || err.message || 'Could not load your datasets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setMaxSamples(String(DEFAULT_MAX_SAMPLES));
    setNote('');
    setError('');
    setConflict('');
    loadDatasets();
  }, [open, loadDatasets]);

  const sampleCount = Number(maxSamples);
  const badSamples = !Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > MAX_SAMPLES_CAP;

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setConflict('');
    try {
      const resp = await axios.post(`${URL}/api/inference-requests`, {
        model_id: model.model_id,
        dataset_id: datasetId,
        max_samples: sampleCount,
        note: note.trim(),
      }, { headers: authHeader() });
      onSubmitted(resp.data);
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict(err?.response?.data?.error || DUPLICATE_REQUEST_TITLE);
      } else {
        setError(err?.response?.data?.error || err.message || 'Could not send the request');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!model) return null;

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Request classification
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          {model.name} · owned by {model.owner_name || 'another researcher'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" icon={<ScienceOutlinedIcon fontSize="inherit" />} sx={{ mb: 2.5 }}>
          <Typography variant="body2">
            Your Site Agent exports the samples you choose and sends them to {model.owner_name || 'the owner'},
            who has to approve the request. Their agent then runs the model on their own machine and returns
            only the predicted class and confidence per sample. You never receive the model, and it never
            leaves their machine.
          </Typography>
        </Alert>

        {conflict && (
          <Alert severity="warning" sx={{ mb: 2 }}
            action={(
              <Button size="small" component={RouterLink} to="/inference-requests" onClick={close}>
                View requests
              </Button>
            )}>
            <AlertTitle>{DUPLICATE_REQUEST_TITLE}</AlertTitle>
            Wait for it to finish before sending another.
            {conflict && conflict !== DUPLICATE_REQUEST_TITLE ? ` (${conflict})` : ''}
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Loading your datasets…</Typography>
          </Stack>
        ) : loadError ? (
          <Alert severity="error" action={<Button size="small" onClick={loadDatasets}>Retry</Button>}>
            {loadError}
          </Alert>
        ) : datasets.length === 0 ? (
          <Alert severity="info"
            action={<Button size="small" component={RouterLink} to="/my-data">My Data</Button>}>
            You have no datasets registered yet. Register one and let your Site Agent sync it before
            asking for classifications.
          </Alert>
        ) : (
          <Box>
            <TextField
              select fullWidth required label="Dataset to classify"
              value={datasetId} onChange={(e) => setDatasetId(e.target.value)}
              helperText="Samples are drawn from this dataset by your own Site Agent."
            >
              {datasets.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.phenotype || 'Unnamed dataset'}
                  {d.number_of_samples != null ? ` · ${d.number_of_samples} samples` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth type="number" label="Maximum samples to send" sx={{ mt: 2 }}
              value={maxSamples} onChange={(e) => setMaxSamples(e.target.value)}
              error={badSamples}
              inputProps={{ min: 1, max: MAX_SAMPLES_CAP }}
              helperText={badSamples
                ? `Enter a whole number between 1 and ${MAX_SAMPLES_CAP}`
                : `The server caps this at ${MAX_SAMPLES_CAP} per request.`}
            />

            <TextField
              fullWidth multiline minRows={2} label="Note to the owner (optional)" sx={{ mt: 2 }}
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What you are trying to find out, and why this model."
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained" onClick={submit}
          disabled={submitting || loading || !datasetId || badSamples}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RequestClassificationDialog;
