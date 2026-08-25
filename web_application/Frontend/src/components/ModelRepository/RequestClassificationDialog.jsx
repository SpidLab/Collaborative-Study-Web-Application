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

// The server's 409 body says exactly this, so don't repeat it under the alert title.
const DUPLICATE_REQUEST_TITLE = 'You already have an open request for this model';

// A count is always recorded at upload time, but never render a bare `null` at the
// owner if a legacy row is missing one.
const sizePhrase = (d) => {
  const samples = d.n_samples != null ? `${d.n_samples} samples` : 'The samples in this batch';
  return d.n_markers != null ? `${samples} × ${d.n_markers} markers` : samples;
};

const RequestClassificationDialog = ({ open, model, onClose, onSubmitted }) => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState('');

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const resp = await axios.get(`${URL}/api/classification-data`, { headers: authHeader() });
      const rows = Array.isArray(resp?.data?.datasets) ? resp.data.datasets : [];
      setDatasets(rows);
      setDatasetId(rows.length === 1 ? String(rows[0].id) : '');
    } catch (err) {
      setLoadError(err?.response?.data?.error || err.message || 'Could not load your classification data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setError('');
    setConflict('');
    loadDatasets();
  }, [open, loadDatasets]);

  const selected = datasets.find((d) => String(d.id) === datasetId);

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
        classification_dataset_id: datasetId,
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
            Pick one of the batches you uploaded under Classification Data. Those samples go
            to {model.owner_name || 'the owner'}, who has to approve the request; their agent then runs
            the model on their own machine and returns only the predicted class and confidence per
            sample. You never receive the model, and it never leaves their machine.
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
            <Typography variant="body2" color="text.secondary">Loading your classification data…</Typography>
          </Stack>
        ) : loadError ? (
          <Alert severity="error" action={<Button size="small" onClick={loadDatasets}>Retry</Button>}>
            {loadError}
          </Alert>
        ) : datasets.length === 0 ? (
          <Alert severity="info"
            action={(
              <Button size="small" component={RouterLink} to="/classification-data" onClick={close}>
                Upload samples
              </Button>
            )}>
            <AlertTitle>You have no classification data uploaded</AlertTitle>
            Classification runs on samples you upload for that purpose — not on your My Data cohorts,
            which stay on your own machine. Upload a CSV under Classification Data first.
          </Alert>
        ) : (
          <Box>
            <TextField
              select fullWidth required label="Samples to classify"
              value={datasetId} onChange={(e) => setDatasetId(e.target.value)}
              helperText={selected
                ? `${sizePhrase(selected)} will be sent to ${model.owner_name || 'the owner'}.`
                : 'From the batches you uploaded under Classification Data.'}
            >
              {datasets.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.name || 'Uploaded samples'}
                  {d.n_samples != null ? ` · ${d.n_samples} samples` : ''}
                  {d.n_markers != null ? ` · ${d.n_markers} markers` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth multiline minRows={2} label="Note to the owner (optional)" sx={{ mt: 2 }}
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What you are trying to find out, and why this model."
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Need a different batch? Manage your uploads under{' '}
              <Box component={RouterLink} to="/classification-data" onClick={close}
                sx={{ color: 'primary.main', textDecoration: 'underline' }}>
                Classification Data
              </Box>.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained" onClick={submit}
          disabled={submitting || loading || !datasetId}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RequestClassificationDialog;
