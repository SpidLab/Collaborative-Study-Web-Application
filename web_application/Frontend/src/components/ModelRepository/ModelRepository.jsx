import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Grid, InputAdornment, Snackbar, Stack, Tab,
  Tabs, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import axios from 'axios';
import URL from '../../config';
import ModelCard from './ModelCard';
import RegisterModelDialog from './RegisterModelDialog';
import EditModelDialog from './EditModelDialog';
import RequestClassificationDialog from './RequestClassificationDialog';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const ModelRepository = () => {
  const [tab, setTab] = useState('all');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const [registerOpen, setRegisterOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [inferenceTarget, setInferenceTarget] = useState(null);

  const notify = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  // Flipping tabs fires a second request while the first is still in flight. Without
  // this guard the slower response wins and the list ends up showing the other tab's
  // models (or clears `loading` while a newer fetch is still running).
  const fetchSeq = useRef(0);

  const fetchModels = useCallback(async () => {
    const seq = fetchSeq.current + 1;
    fetchSeq.current = seq;
    setLoading(true);
    try {
      const resp = await axios.get(`${URL}/api/models`, {
        headers: authHeader(),
        params: tab === 'mine' ? { mine: true } : undefined,
      });
      if (seq !== fetchSeq.current) return;
      setModels(resp?.data?.models || []);
      setError('');
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      setError(err?.response?.data?.error || err.message || 'Failed to load the model repository');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const replaceModel = (fresh) => setModels((list) => list.map(
    (m) => (m.model_id === fresh.model_id ? { ...m, ...fresh } : m),
  ));

  const patchModel = async (model, body) => {
    try {
      const resp = await axios.patch(`${URL}/api/models/${model.model_id}`, body, { headers: authHeader() });
      replaceModel(resp.data);
      if ('visibility' in body) {
        notify(body.visibility === 'public'
          ? 'Model is now public. Others can see the entry — never the weights.'
          : 'Model is now private. Only you can see it, and classification requests are off.');
      } else if ('allow_inference_requests' in body) {
        notify(body.allow_inference_requests
          ? 'Classification requests enabled. You approve each one.'
          : 'Classification requests disabled.');
      } else {
        notify('Model updated.');
      }
    } catch (err) {
      notify(err?.response?.data?.error || err.message || 'Update failed', 'error');
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${URL}/api/models/${deleteTarget.model_id}`, { headers: authHeader() });
      setModels((list) => list.filter((m) => m.model_id !== deleteTarget.model_id));
      setDeleteTarget(null);
      notify('Model removed from the repository.');
    } catch (err) {
      notify(err?.response?.data?.error || err.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => [
      m.name, m.dataset, m.task, m.framework, m.architecture, m.owner_name, m.collaboration_name,
    ].some((field) => String(field || '').toLowerCase().includes(q)));
  }, [models, query]);

  const emptyState = tab === 'mine' ? {
    icon: <Inventory2OutlinedIcon sx={{ fontSize: 52, color: 'text.disabled' }} />,
    title: 'You have not listed any models yet',
    body: 'Finish a Federated Learning collaboration and its global model is listed here automatically, '
      + 'or register a model you already own — metadata only, no file.',
  } : {
    icon: <LibraryBooksIcon sx={{ fontSize: 52, color: 'text.disabled' }} />,
    title: 'No models listed yet',
    body: 'Public entries from every researcher show up here, alongside your own private ones. '
      + 'Register a model, or run a Federated Learning collaboration to publish one.',
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      <Box sx={{
        p: { xs: 2.5, md: 3.5 }, mb: 3, borderRadius: 2, color: 'white',
        background: 'linear-gradient(120deg,#0f3a63 0%,#1976d2 60%,#42a5f5 100%)',
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <LibraryBooksIcon sx={{ fontSize: 34 }} />
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Model Repository</Typography>
        </Stack>
        <Typography variant="body1" sx={{ mt: 1, maxWidth: 820, opacity: 0.95 }}>
          A catalog of what models exist, what they were trained on, and how they scored — models
          aggregated by federated-learning collaborations here, plus models researchers already own
          and choose to list. This is a listing, not a store: every model&apos;s weights stay on its
          owner&apos;s machine, so there is nothing here to download.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.9, maxWidth: 820 }}>
          If an owner offers a black-box service you can send them samples instead: their agent runs
          the model locally and returns predictions only.
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}
        justifyContent="space-between" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab value="all" label="All models" />
          <Tab value="mine" label="My models" />
        </Tabs>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" component={RouterLink} to="/inference-requests"
            startIcon={<ScienceOutlinedIcon />}>
            Classification requests
          </Button>
          <Button size="small" startIcon={<RefreshIcon />} onClick={fetchModels} disabled={loading}>
            Refresh
          </Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => setRegisterOpen(true)} sx={{ borderRadius: 2 }}>
            Register a model
          </Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}
        justifyContent="space-between" sx={{ mb: 2.5 }}>
        <TextField
          size="small" placeholder="Search by name, dataset, task, owner…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          sx={{ width: { xs: '100%', sm: 340 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {loading
            ? 'Loading…'
            : `${visible.length} model${visible.length === 1 ? '' : 's'}${tab === 'mine' ? ' you own' : ' visible to you'}`}
        </Typography>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}
          action={<Button size="small" onClick={fetchModels}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 8 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">Loading the catalog…</Typography>
        </Stack>
      ) : visible.length > 0 ? (
        <Grid container spacing={3}>
          {visible.map((model) => (
            <Grid item xs={12} md={6} lg={4} key={model.model_id}>
              <ModelCard
                model={model}
                onPatch={patchModel}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
                onRequestClassification={setInferenceTarget}
              />
            </Grid>
          ))}
        </Grid>
      ) : error ? null : (
        <Card variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed' }}>
          <CardContent sx={{ textAlign: 'center', py: 7 }}>
            {query.trim() ? (
              <>
                <SearchIcon sx={{ fontSize: 52, color: 'text.disabled' }} />
                <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>
                  Nothing matches &ldquo;{query.trim()}&rdquo;
                </Typography>
                <Button sx={{ mt: 1 }} onClick={() => setQuery('')}>Clear search</Button>
              </>
            ) : (
              <>
                {emptyState.icon}
                <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>{emptyState.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 540, mx: 'auto' }}>
                  {emptyState.body}
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} sx={{ mt: 2.5, borderRadius: 2 }}
                  onClick={() => setRegisterOpen(true)}>
                  Register a model
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <RegisterModelDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onRegistered={(model) => {
          setRegisterOpen(false);
          notify(`"${model.name}" is listed. Metadata only — your model file never left your machine.`);
          // The new entry may not belong in the current tab's query result, so refetch.
          fetchModels();
        }}
      />

      <EditModelDialog
        open={Boolean(editTarget)}
        model={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(fresh) => {
          replaceModel(fresh);
          setEditTarget(null);
          notify('Model details updated.');
        }}
      />

      <RequestClassificationDialog
        open={Boolean(inferenceTarget)}
        model={inferenceTarget}
        onClose={() => setInferenceTarget(null)}
        onSubmitted={() => {
          setInferenceTarget(null);
          notify('Request sent. Track it under Classification requests.');
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete this entry?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            &ldquo;{deleteTarget?.name}&rdquo; will be removed from the catalog and any open
            classification requests for it will be declined. Your model file is untouched — it was
            never stored here. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : null}>
            {deleting ? 'Deleting…' : 'Delete entry'}
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

export default ModelRepository;
