import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Divider, IconButton, LinearProgress, Paper,
  Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const CSV_EXAMPLE = `sample_id,rs1801133,rs4988235,rs429358
S001,0,2,1
S002,1,1,0`;

const UploadPanel = ({ maxSamples, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const pick = (e) => {
    const chosen = e.target.files && e.target.files[0];
    // Clear the input so picking the same file again still fires a change event.
    e.target.value = '';
    if (!chosen) return;
    setFile(chosen);
    setError('');
    if (!name.trim()) setName(chosen.name.replace(/\.[^.]+$/, ''));
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    if (name.trim()) formData.append('name', name.trim());
    if (note.trim()) formData.append('note', note.trim());
    try {
      // No Content-Type here on purpose — the browser has to set the multipart boundary.
      const resp = await axios.post(`${URL}/api/classification-data`, formData, {
        headers: { ...authHeader() },
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });
      setFile(null);
      setName('');
      setNote('');
      onUploaded(resp.data);
    } catch (err) {
      // The server writes these 400s for a human to read (sample cap, label-only
      // columns, unreadable CSV, wrong encoding), so show them word for word.
      setError(err?.response?.data?.error || err.message || 'Could not upload that file');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: { xs: 2.5, md: 3 }, mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>Upload samples to classify</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 780 }}>
        A CSV where the first column is the sample id and every remaining column is a marker.
        Label columns (<code>phenotype</code>, <code>label</code>, <code>status</code>, and the like)
        are dropped automatically — the label is what you are asking the model to predict.
        {maxSamples != null && ` Up to ${maxSamples} samples per file.`}
      </Typography>

      <Box component="pre" sx={{
        // `m: 0` clears the <pre> UA margin and has to come BEFORE mt/mb — sx emits
        // declarations in key order, so a trailing `margin` shorthand resets them both.
        m: 0, mt: 1.5, mb: 2.5, p: 1.5, borderRadius: 2, overflowX: 'auto',
        bgcolor: '#f6f9fc', border: '1px solid #e3ebf3',
        fontSize: 12, lineHeight: 1.6, color: 'text.secondary',
      }}>
        {CSV_EXAMPLE}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          variant="outlined" component="label" startIcon={<UploadFileIcon />}
          disabled={uploading} sx={{ borderRadius: 2 }}
        >
          Choose CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={pick} />
        </Button>
        {file ? (
          <Chip
            label={`${file.name} · ${(file.size / 1024).toFixed(0)} KB`}
            onDelete={uploading ? undefined : () => setFile(null)}
            variant="outlined"
          />
        ) : (
          <Typography variant="body2" color="text.secondary">No file selected yet.</Typography>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2.5 }}>
        <TextField
          size="small" fullWidth label="Name (optional)"
          value={name} onChange={(e) => setName(e.target.value)} disabled={uploading}
          placeholder="e.g. Replication cohort batch 3"
          helperText="Defaults to the file name."
        />
        <TextField
          size="small" fullWidth label="Note (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} disabled={uploading}
          placeholder="Anything you want to remember about this batch."
        />
      </Stack>

      {uploading && (
        <Box sx={{ mt: 2.5 }}>
          <LinearProgress variant={progress > 0 ? 'determinate' : 'indeterminate'} value={progress}
            sx={{ borderRadius: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
            Uploading {file ? file.name : 'file'}
            {progress > 0 ? ` — ${progress}%` : '…'}
          </Typography>
        </Box>
      )}

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
        <Button
          variant="contained" onClick={upload} disabled={uploading || !file} sx={{ borderRadius: 2 }}
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {uploading ? 'Uploading…' : 'Upload samples'}
        </Button>
      </Stack>
    </Paper>
  );
};

const ClassificationData = () => {
  const [datasets, setDatasets] = useState([]);
  const [maxSamples, setMaxSamples] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await axios.get(`${URL}/api/classification-data`, { headers: authHeader() });
      setDatasets(Array.isArray(resp?.data?.datasets) ? resp.data.datasets : []);
      setMaxSamples(resp?.data?.max_samples ?? null);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not load your classification data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notify = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  const askDelete = (dataset) => {
    setDeleteError(null);
    setDeleteTarget(dataset);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await axios.delete(`${URL}/api/classification-data/${deleteTarget.id}`, { headers: authHeader() });
      setDatasets((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      notify(`"${deleteTarget.name || 'Dataset'}" and its samples were deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      const body = err?.response?.data || {};
      if (err?.response?.status === 409) {
        // Keep the dialog open with the server's explanation and a way to go look
        // at the request that is holding the samples.
        setDeleteError({
          inUse: true,
          message: body.error || 'This dataset is in use by an open classification request.',
          hint: body.hint || '',
          requestId: body.request_id || '',
        });
      } else {
        setDeleteError({ inUse: false, message: body.error || err.message || 'Could not delete that dataset.' });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" gutterBottom>Classification Data</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 820 }}>
            Batches of samples you have uploaded so that another site&apos;s model can classify them.
            This is not the same thing as My Data: the cohorts in My Data are described by metadata
            only and the genotype files stay on your machine. The files here really are uploaded,
            because handing the samples to the model owner is the entire point of a classification
            request. Upload only what you want that owner to see, and delete a batch when you are done
            with it.
          </Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        The model itself never moves. The owner&apos;s Site Agent runs their local copy on these
        samples and returns only a predicted class and confidence per sample — you never receive the
        model, and its weights never leave their machine.
        {maxSamples != null && ` A single file may hold at most ${maxSamples} samples.`}
      </Alert>

      <UploadPanel
        maxSamples={maxSamples}
        onUploaded={(dataset) => {
          setDatasets((prev) => [dataset, ...prev.filter((d) => d.id !== dataset.id)]);
          notify(`"${dataset.name || 'Samples'}" uploaded — ${dataset.n_samples} samples, ${dataset.n_markers} markers.`);
        }}
      />

      <Divider sx={{ mb: 3 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : error ? (
        <Alert severity="error" action={<Button size="small" onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      ) : datasets.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed', textAlign: 'center', py: 6, px: 3 }}>
          <ScienceOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>
            You haven&apos;t uploaded any classification data yet.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 560, mx: 'auto' }}>
            Upload a CSV above, then find a public model that offers a classification service in the
            Model Repository and ask its owner to run it on that batch.
          </Typography>
          <Button component={RouterLink} to="/models" variant="contained" sx={{ mt: 2.5, borderRadius: 2 }}>
            Browse the Model Repository
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell align="right"><strong>Samples</strong></TableCell>
                <TableCell align="right"><strong>Markers</strong></TableCell>
                <TableCell><strong>Source file</strong></TableCell>
                <TableCell><strong>Uploaded</strong></TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{d.name || 'Uploaded samples'}</Typography>
                    {d.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 320 }}>
                        {d.note}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{d.n_samples != null ? d.n_samples : '—'}</TableCell>
                  <TableCell align="right">{d.n_markers != null ? d.n_markers : '—'}</TableCell>
                  <TableCell>
                    {d.source_filename
                      ? <code>{d.source_filename}</code>
                      : <Typography variant="body2" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell>{fmtDate(d.uploaded_at)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Delete these samples">
                      <IconButton size="small" onClick={() => askDelete(d)} aria-label="Delete dataset">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete these samples?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            &ldquo;{deleteTarget?.name || 'Uploaded samples'}&rdquo; and the
            {deleteTarget?.n_samples != null ? ` ${deleteTarget.n_samples} ` : ' '}
            uploaded samples in it will be removed from the server. Predictions you have already
            received are unaffected. This cannot be undone.
          </DialogContentText>

          {deleteError && (
            <Alert
              severity={deleteError.inUse ? 'warning' : 'error'}
              sx={{ mt: 2 }}
              action={deleteError.inUse ? (
                <Button size="small" component={RouterLink} to="/inference-requests"
                  onClick={() => setDeleteTarget(null)}>
                  View request
                </Button>
              ) : null}
            >
              {deleteError.inUse && <AlertTitle>{deleteError.message}</AlertTitle>}
              {deleteError.inUse ? deleteError.hint : deleteError.message}
              {deleteError.inUse && deleteError.requestId && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
                  Request <code>{deleteError.requestId}</code>
                </Typography>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button
            color="error" variant="contained" onClick={confirmDelete}
            disabled={deleting || Boolean(deleteError && deleteError.inUse)}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {deleting ? 'Deleting…' : 'Delete samples'}
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

export default ClassificationData;
